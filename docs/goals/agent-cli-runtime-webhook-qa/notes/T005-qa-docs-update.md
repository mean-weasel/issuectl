# T005: QA Docs Update

Task: `T005`
Kind: `worker`
Status: `current`

## Summary

Updated the webhook QA runbooks so future Chrome-extension runs explicitly verify deterministic `ISSUECTL_CLI` agent controls, absence of `issuectl: command not found`, completion-result persistence, and hook/tunnel cleanup when live webhook QA is finished.

## Verification

- `rg -n "ISSUECTL_CLI|issuectl agent|disable|tunnel|cleanup|active webhook" docs/workflows` was run against the updated workflow files and showed the expected deterministic CLI and cleanup coverage.
- Manual markdown review against the goal oracle: the basic issue, PR auto-review, full chained, and ladder docs now ask for `ISSUECTL_CLI` evidence and cleanup proof.

## Board Receipt Snippet

```yaml
receipt:
  result: done
  summary: "Webhook QA docs now require ISSUECTL_CLI evidence and hook/tunnel cleanup proof."
  changed_files:
    - "docs/workflows/webhook-basic-issue-label-qa.md"
    - "docs/workflows/webhook-pr-auto-review-qa.md"
    - "docs/workflows/webhook-full-chained-issue-to-pr-qa.md"
    - "docs/workflows/webhook-qa-ladder.md"
    - "docs/goals/agent-cli-runtime-webhook-qa/state.yaml"
    - "docs/goals/agent-cli-runtime-webhook-qa/notes/T005-qa-docs-update.md"
  commands:
    - command: "Manual markdown review against goal oracle"
      status: pass
    - command: "rg -n \"ISSUECTL_CLI|issuectl agent|disable|tunnel|cleanup|active webhook\" docs/workflows"
      status: pass
  note: notes/T005-qa-docs-update.md
```
