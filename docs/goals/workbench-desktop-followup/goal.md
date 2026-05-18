# Workbench Desktop Follow-Up Goal

## Objective

Bring the desktop `/workbench` UX from implemented prototype-complete state to dogfood-ready desktop quality by fixing session/terminal discoverability, issue-detail action hierarchy, deployment-history clarity, desktop issue queue density, URL-addressable focus state, and QA documentation alignment.

## Original Request

Use the three independent Workbench critiques to work out design choices first, then prepare a GoalBuddy board with a succinct granular task list and explicit acceptance criteria. The agreed scope is desktop only for this run; mobile/narrow Workbench behavior is out of scope and QA expectations should say so.

## Intake Summary

- Input shape: `existing_plan`
- Audience: Jeremy as the primary desktop Workbench operator and future GoalBuddy/Codex workers executing the follow-up tranche.
- Authority: `approved`
- Proof type: `test`
- Completion proof: desktop Workbench follow-up changes are implemented and verified with targeted unit/Playwright coverage, updated QA/manual dogfood docs, fresh screenshot or rendered proof where useful, and a final audit mapping all acceptance criteria back to the critique findings.
- Likely misfire: polishing visuals while leaving terminal failures hidden, launch sessions hard to find, mutating issue actions too easy to trigger, deployment history ambiguous, or QA docs contradicting actual drawer behavior.
- Blind spots considered: mobile/narrow usability is intentionally out of scope for this run; URL-addressable state may touch routing and reload behavior; terminal proxy failure detection may need a pragmatic first slice rather than a full terminal protocol redesign; empty-repo full-suite stability is a QA reliability task, not a product UI change.

## Agreed Design Choices

- Scope this run to desktop Workbench and update QA expectations accordingly.
- After launch, terminal focus may remain primary, but the new session must be discoverable from visible Workbench chrome.
- Terminal auth/proxy/iframe failures must surface as Workbench-owned ready/error states instead of low-contrast iframe body text.
- Issue reading and launch prep should be primary; mutation-heavy actions should be grouped, guarded, and free of synthetic live defaults.
- Deployment history should distinguish active sessions from ended/stale history and expose jump actions only for active deployments.
- Focus state should become URL-addressable for repo issue/session links.
- Desktop issue queue cards should become denser scan-friendly rows.
- Manual QA docs should match actual drawer policy: issue focus prioritizes issues, terminal focus prioritizes sessions, global modes collapse side panes.

## Non-Goals

- Do not redesign mobile/narrow Workbench in this run.
- Do not implement named plain shells.
- Do not change existing dashboard routes outside `/workbench` unless required by shared tests.
- Do not mutate live GitHub data during verification except through clearly gated/manual dogfood steps.
- Do not start implementation until a `/goal` run activates the board.

## Stop Rule

Stop only when a final audit proves every required desktop acceptance criterion is either implemented and verified or explicitly deferred with owner-approved rationale.

## Canonical Board

Machine truth lives at:

`docs/goals/workbench-desktop-followup/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/workbench-desktop-followup/goal.md.
```

