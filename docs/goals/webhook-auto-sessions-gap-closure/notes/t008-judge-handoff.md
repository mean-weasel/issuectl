Objective: T008 read-only Judge. Approve or reject the mutation/credential isolation design needed before issuectl can implement PR auto-review for issue #506.

Working directory: /Users/neonwatty/Desktop/issuectl

Allowed edit paths:
- docs/goals/webhook-auto-sessions-gap-closure/notes/t008-judge-claude-report.md

Forbidden edit paths:
- All implementation source files.
- All tests.
- docs/goals/webhook-auto-sessions-gap-closure/state.yaml

Context:
- Follow repo instructions in CLAUDE.md and AGENTS.md.
- GoalBuddy state is in docs/goals/webhook-auto-sessions-gap-closure/state.yaml.
- T007 is complete locally: deployments now have target_type and target_number, issue_number is nullable, PR targets no longer need fake issue numbers, and PR auto-review remains disabled.
- T008 must be read-only except for the report file above.

Judge questions:
1. What mutation and credential-isolation design should be required before enabling PR auto-review?
2. What first Worker slice, if any, is safe after T008?
3. Which files should that Worker be allowed to edit?
4. Which verification commands and stop_if conditions should the board use?
5. Are there owner decisions or blockers that cannot be resolved locally?

Expected report format:
- decision: approved | needs_more_scout | blocked
- summary
- recommended design
- approved first worker objective
- allowed_files
- verify commands
- stop_if conditions
- blockers_or_owner_questions
- evidence: cite concrete local files and, if you use GitHub issue #506, cite the command/source used

Commands you may run:
- rg, sed, git diff, git status, pnpm test/typecheck/lint in read-only mode if useful
- gh issue view 506 if authenticated

Stop after writing the report. Do not modify implementation files.
