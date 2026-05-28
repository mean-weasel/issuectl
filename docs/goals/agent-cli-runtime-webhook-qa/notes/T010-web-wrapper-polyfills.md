# T010 Web Wrapper Polyfills

## Result

Done. The CLI `issuectl web` wrapper now starts the web server with `packages/web/server-polyfills.mjs` imported before `tsx`, matching the web package runtime setup needed under Node 24.

## Evidence

- `packages/cli/src/commands/web.ts` builds server args as:
  - `--import <web>/server-polyfills.mjs`
  - `--import tsx`
  - `<web>/server.ts`
  - `--dev`
- `packages/cli/src/commands/web.test.ts` verifies the polyfill import order.
- `pnpm --dir packages/cli test -- web` passed: 4 files, 23 tests.
- `pnpm --dir packages/cli typecheck` passed.
- `pnpm --dir packages/cli lint` passed.
- `pnpm --dir packages/cli build` passed.
- `pnpm --dir packages/cli exec issuectl web --port 3847` started successfully under Node 24.14.1.
- `curl http://localhost:3847/` returned `status=200` with a rendered response.

## Follow-Up

The local web server remained running on port `3847` for T007 live Chrome-extension webhook QA.
