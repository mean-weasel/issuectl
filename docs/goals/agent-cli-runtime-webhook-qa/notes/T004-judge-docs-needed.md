# T004: Judge Docs Need

Task: `T004`
Kind: `judge`
Status: `current`

## Decision

Activate T005. The runtime behavior changed the exact command agents are expected to use, and the QA runbooks do not yet require `ISSUECTL_CLI` evidence in their pass criteria or receipts. The basic issue, PR auto-review, full chained QA, and ladder docs should be updated so future Codex agents verify deterministic CLI command usage and explicitly shut down hook/tunnel state after live webhook QA.

## Scope

Update only the approved workflow docs:

- `docs/workflows/webhook-basic-issue-label-qa.md`
- `docs/workflows/webhook-pr-auto-review-qa.md`
- `docs/workflows/webhook-full-chained-issue-to-pr-qa.md`
- `docs/workflows/webhook-qa-ladder.md`

## Board Receipt Snippet

```yaml
receipt:
  result: done
  decision: "Run T005 because the runbooks need deterministic ISSUECTL_CLI evidence and stronger hook/tunnel cleanup criteria."
  note: notes/T004-judge-docs-needed.md
  summary: "Activate T005 docs update before live Chrome QA."
```
