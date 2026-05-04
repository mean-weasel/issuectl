# Iteration 14

## Summary

Made the server API token cache bounded and safer for token creation or rotation: cached tokens now expire after 30 seconds, missing tokens are not cached permanently, and focused tests cover reuse, TTL refresh, and no-token recovery.

## Verification

pnpm --filter @issuectl/web test -- api-auth.test.ts passed (14 tests).

## Process Learning Reflection

- Local-only:
- Candidate skill learning:
- Candidate repo change:
- Upstream review proposed:

## Judge Decision

Completed the requested 10 auto-loop iterations. Implemented iOS caching, render-work reductions, upload processing changes, polling reductions, and a small server auth optimization; remaining work should be validated with simulator ETTrace/Instruments before more speculative changes.
