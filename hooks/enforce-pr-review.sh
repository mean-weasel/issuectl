#!/usr/bin/env bash
#
# PreToolUse hook: intercepts `gh pr create` and forces Claude to run the
# pr-review-toolkit's full review command first.
#
# Why PreToolUse (not PostToolUse):
# The pr-review-toolkit's own docs say "Run early: Before creating PR, not
# after." Blocking at PreToolUse matches that philosophy — Claude sees the
# block reason, runs /pr-review-toolkit:review-pr, addresses findings, then
# re-attempts `gh pr create`.
#
# Why no state file:
# Determinism comes from the command shape. Every PR is created with some
# form of `gh pr create`, and the hook fires on every Bash tool call before
# execution. The "has the review run yet?" question is answered by a magic
# token Claude must append to the command on the second attempt:
#
#     gh pr create --title "..." --body "..."         # blocked
#     gh pr create --title "..." --body "..." # reviewed   # allowed
#
# The token is a shell comment (`# reviewed`) so it's harmless to `gh`, which
# only sees the command line up to the comment. Claude reads the block reason,
# which tells it exactly what to do: run the review, then re-issue the command
# with `# reviewed` appended.
#
# This keeps the hook completely stateless: no session marker, no Stop safety
# net, no UserPromptSubmit hook, no cross-hook coordination.

set -uo pipefail
# Note: NOT `set -e`. We want to catch jq failures (missing binary, bad
# payload) explicitly so the hook can always emit a proper PreToolUse JSON
# response instead of crashing halfway through. A non-zero exit from this
# script is a bug; every code path either exits 0 with no output (allow) or
# exits 0 with a deny JSON on stdout (block).

# Hardcoded deny JSON for the "internal error" fail-closed path. Uses printf
# rather than jq because the most likely reason we're in this branch is that
# jq isn't available. The reason string is plain ASCII with no characters
# that need JSON escaping, so embedding it literally is safe.
emit_internal_error_deny() {
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"pr-review hook internal error: could not parse the PreToolUse payload. Most likely cause: jq is not installed on PATH. Install jq (brew install jq / apt-get install jq) and retry. Failing closed as a safety measure so a missing dependency does not silently disable the review gate."}}'
}

input=$(cat)

# Empty stdin is not a valid PreToolUse payload. jq would silently accept it
# and return an empty string for every field — which would make us think the
# tool_name isn't Bash and allow the call through. Fail closed instead.
if [[ -z "$input" ]]; then
  emit_internal_error_deny
  exit 0
fi

if ! tool_name=$(jq -r '.tool_name // ""' <<< "$input" 2>/dev/null); then
  emit_internal_error_deny
  exit 0
fi
[[ "$tool_name" == "Bash" ]] || exit 0

# For a Bash tool call, .tool_input.command MUST be a string. A non-string
# value (array, object, number) is an unexpected schema we can't safely match
# against — jq -r would stringify it in ways that either accidentally match
# the regex for the wrong reason, or silently allow a crafted command to slip
# through. Fail closed on any type mismatch. Using jq's error() to trip the
# if! branch keeps the fail-closed path unified with the other jq guards.
if ! command=$(jq -r 'if (.tool_input.command | type) == "string" then .tool_input.command else error("command not a string") end' <<< "$input" 2>/dev/null); then
  emit_internal_error_deny
  exit 0
fi

# Match `gh pr create` only at a shell statement boundary: start of the
# command string, or immediately after one of `; & | {`. Without this anchor
# the regex fires on unrelated commands whose arguments happen to quote the
# literal phrase — e.g. a `git commit` whose message body mentions the phrase
# in prose, or `grep "gh pr create" README.md`.
#
# The boundary class is tighter than it looks. Each character had to survive
# the same test: does its shell meaning dominate its prose meaning? `{ ; & |`
# qualify — they're rare in prose about shell commands. The following
# characters failed that test and are deliberately EXCLUDED:
#
# - Newline. A HEREDOC or PR body that starts a line with `gh pr create` in
#   prose (documenting the hook itself, for instance) is far more common in
#   this codebase than a real multi-line shell script Claude would execute,
#   where commands are almost always chained with `&&` or `;` anyway.
# - Backtick. Markdown inline-code backticks in commit bodies look identical
#   to shell command-substitution backticks in the raw tool_input.command
#   string. The legacy `` `...` `` form is obsolete anyway.
# - Open paren. Same reasoning: `$(gh pr create)` in prose describing a shell
#   command is common (see this very comment block), and is indistinguishable
#   from a real `$(...)` command substitution. Claude runs `gh pr create`
#   directly, not inside command substitution, so dropping `(` costs nothing
#   in practice.
#
# Known limitations (intentional misses, each pinned by an allow-test in
# hooks/test.sh so any future "fix" is a deliberate choice):
#
# - Env-var prefix form:        `GH_TOKEN=x gh pr create ...`
# - Shell keywords:              `if true; then gh pr create ...; fi`
# - Command substitution form:  `$(gh pr create ...)` / `` `gh pr create` ``
#
# For all of these, the fallback is the same as any other edge case: the user
# tells Claude to append the ` # reviewed` sentinel after actually running
# the review.
pr_create_re=$'(^|[;&|{])[[:space:]]*gh[[:space:]]+pr[[:space:]]+create'
[[ "$command" =~ $pr_create_re ]] || exit 0

# Escape hatch: Claude has run the review and is re-attempting.
#
# The token must appear as a TRAILING shell comment on the command line — i.e.
# preceded by whitespace and anchored to the end of the command string. This
# avoids false positives from the literal text "# reviewed" showing up inside
# a PR body HEREDOC, a markdown heading in --body, etc.
if [[ "$command" =~ [[:space:]]#[[:space:]]+reviewed[[:space:]]*$ ]]; then
  exit 0
fi

# Block and tell Claude exactly what to do.
jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: (
      "This `gh pr create` is blocked until the pr-review-toolkit has run on the staged changes.\n\n" +
      "Required steps (in order):\n" +
      "1. Run the full toolkit review on the current diff:\n" +
      "     /pr-review-toolkit:review-pr all\n" +
      "   This auto-dispatches every applicable specialized agent:\n" +
      "   code-reviewer, pr-test-analyzer, comment-analyzer,\n" +
      "   silent-failure-hunter, type-design-analyzer, code-simplifier.\n" +
      "2. Address every Critical issue and every Important issue the review surfaces.\n" +
      "   Re-run targeted reviews after fixes to verify (e.g. `/pr-review-toolkit:review-pr errors`).\n" +
      "3. Re-issue the SAME `gh pr create` command with the literal shell comment ` # reviewed`\n" +
      "   appended to the end of the command line. The trailing comment is how this hook\n" +
      "   knows the review has been completed.\n\n" +
      "Do not skip the review. Do not append `# reviewed` without actually running it."
    )
  }
}'

exit 0
