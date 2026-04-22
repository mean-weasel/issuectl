# ttyd WebSocket Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route all ttyd terminal traffic (HTML, JS, CSS, WebSocket) through the Next.js dashboard server so terminals work through the Cloudflare tunnel without mixed-content blocking.

**Architecture:** A custom `server.ts` wraps the Next.js app to intercept HTTP `upgrade` events for WebSocket proxying. Standard Next.js Route Handlers proxy ttyd's HTTP assets. The iframe switches from `http://localhost:{port}` to the same-origin `/api/terminal/{port}/`.

**Tech Stack:** Node.js `http.createServer`, `node:http` for HTTP proxying, `ws` library (or raw sockets) for WebSocket upgrade, Next.js App Router Route Handlers, existing `@issuectl/core` DB functions.

**Spec:** `docs/superpowers/specs/2026-04-22-ttyd-websocket-proxy-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/web/server.ts` | Create | Custom HTTP server wrapping Next.js + WS upgrade handler |
| `packages/web/lib/terminal-proxy.ts` | Create | WebSocket upgrade logic + HTTP proxy helper |
| `packages/web/lib/terminal-proxy.test.ts` | Create | Unit tests for proxy validation/helpers |
| `packages/web/app/api/terminal/[port]/route.ts` | Create | HTTP proxy for ttyd's root HTML page |
| `packages/web/app/api/terminal/[port]/[...path]/route.ts` | Create | HTTP proxy catch-all for ttyd sub-assets |
| `packages/web/components/terminal/TerminalPanel.tsx` | Modify | Change iframe src to `/api/terminal/{port}/` |
| `packages/web/next.config.ts` | Modify | Update CSP `frame-src`, update comments |
| `packages/web/package.json` | Modify | Add `ws` dependency, update `dev`/`start` scripts |
| `packages/core/src/launch/ttyd.ts` | Modify | Add `-i 127.0.0.1` flag to ttyd spawn |
| `packages/core/src/db/deployments.ts` | Modify | Add `getActiveDeploymentByPort()` lookup |
| `packages/core/src/index.ts` | Modify | Export new `getActiveDeploymentByPort` |
| `packages/cli/src/commands/web.ts` | Modify | Spawn `node server.js` instead of `next dev` |

---

### Task 1: Add DB lookup — `getActiveDeploymentByPort`

The proxy needs to validate that a requested port belongs to an active deployment. No such function exists yet.

**Files:**
- Modify: `packages/core/src/db/deployments.ts`
- Modify: `packages/core/src/db/deployments.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

In `packages/core/src/db/deployments.test.ts`, add a new `describe` block:

```typescript
describe("getActiveDeploymentByPort", () => {
  it("returns the deployment when port matches an active row", () => {
    const repo = addRepo(db, { owner: "acme", name: "api", localPath: "/tmp/fake" });
    const dep = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 10,
      branchName: "test-branch",
      workspaceMode: "existing",
      workspacePath: "/tmp/ws",
    });
    db.prepare("UPDATE deployments SET ttyd_port = ? WHERE id = ?").run(7700, dep.id);

    const found = getActiveDeploymentByPort(db, 7700);
    expect(found).toBeDefined();
    expect(found!.id).toBe(dep.id);
    expect(found!.ttydPort).toBe(7700);
  });

  it("returns undefined when no deployment uses the port", () => {
    expect(getActiveDeploymentByPort(db, 7700)).toBeUndefined();
  });

  it("returns undefined for an ended deployment's port", () => {
    const repo = addRepo(db, { owner: "acme", name: "api", localPath: "/tmp/fake" });
    const dep = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 11,
      branchName: "ended-branch",
      workspaceMode: "existing",
      workspacePath: "/tmp/ws",
    });
    db.prepare("UPDATE deployments SET ttyd_port = ? WHERE id = ?").run(7701, dep.id);
    db.prepare("UPDATE deployments SET ended_at = datetime('now') WHERE id = ?").run(dep.id);

    expect(getActiveDeploymentByPort(db, 7701)).toBeUndefined();
  });

  it("returns undefined for a pending deployment's port", () => {
    const repo = addRepo(db, { owner: "acme", name: "api", localPath: "/tmp/fake" });
    const dep = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 12,
      branchName: "pending-branch",
      workspaceMode: "existing",
      workspacePath: "/tmp/ws",
      state: "pending",
    });
    db.prepare("UPDATE deployments SET ttyd_port = ? WHERE id = ?").run(7702, dep.id);

    expect(getActiveDeploymentByPort(db, 7702)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @issuectl/core test -- --grep "getActiveDeploymentByPort"`
Expected: FAIL — `getActiveDeploymentByPort` is not exported.

- [ ] **Step 3: Implement `getActiveDeploymentByPort`**

In `packages/core/src/db/deployments.ts`, add after `hasLiveDeploymentForIssue`:

```typescript
/**
 * Look up the active (non-ended, non-pending) deployment that owns a
 * given ttyd port. Used by the WebSocket proxy to validate that a port
 * belongs to a real session before forwarding traffic.
 */
export function getActiveDeploymentByPort(
  db: Database.Database,
  port: number,
): Deployment | undefined {
  const row = db
    .prepare(
      "SELECT * FROM deployments WHERE ttyd_port = ? AND state = 'active' AND ended_at IS NULL LIMIT 1",
    )
    .get(port) as DeploymentRow | undefined;
  return row ? rowToDeployment(row) : undefined;
}
```

- [ ] **Step 4: Export from `packages/core/src/index.ts`**

Add `getActiveDeploymentByPort` to the deployments export block:

```typescript
export {
  recordDeployment,
  getDeploymentById,
  getDeploymentsForIssue,
  getDeploymentsByRepo,
  hasLiveDeploymentForIssue,
  getActiveDeploymentByPort,
  updateLinkedPR,
  endDeployment,
  activateDeployment,
  deletePendingDeployment,
  cleanupOrphanedDeployments,
  pruneEndedDeployments,
} from "./db/deployments.js";
```

- [ ] **Step 5: Add import in test file**

In `packages/core/src/db/deployments.test.ts`, add `getActiveDeploymentByPort` to the import from `./deployments.js`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/core test -- --grep "getActiveDeploymentByPort"`
Expected: 4 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/db/deployments.ts packages/core/src/db/deployments.test.ts packages/core/src/index.ts
git commit -m "feat: add getActiveDeploymentByPort for proxy port validation"
```

---

### Task 2: Harden ttyd spawn flags — bind to loopback

With the proxy in front, ttyd should only accept connections from localhost.

**Files:**
- Modify: `packages/core/src/launch/ttyd.ts:165-168`
- Modify: `packages/core/src/launch/launch.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/core/src/launch/launch.test.ts`, add a test inside the `"executeLaunch duplicate-deployment pre-check"` describe block:

```typescript
it("passes -i 127.0.0.1 to ttyd for loopback-only binding", async () => {
  addRepo(db, {
    owner: "acme",
    name: "api",
    localPath: "/tmp/fake",
  });

  await executeLaunch(db, {} as Octokit, {
    owner: "acme",
    repo: "api",
    issueNumber: 42,
    branchName: "new-branch",
    workspaceMode: "existing",
    selectedComments: [],
    selectedFiles: [],
  });

  // spawnTtyd is mocked — we can't check the spawn args directly.
  // Instead verify that verifyTtyd and spawnTtyd were both called,
  // confirming the launch flow completed. The actual flag assertion
  // belongs in ttyd.test.ts (unit level).
  expect(verifyTtydSpy).toHaveBeenCalledTimes(1);
  expect(spawnTtydSpy).toHaveBeenCalledTimes(1);
});
```

For the unit-level flag test, create or update `packages/core/src/launch/ttyd.test.ts` with a test that verifies the spawn args include `-i` and `127.0.0.1`. Since `spawnTtyd` calls `child_process.spawn` internally, mock `child_process`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const spawnSpy = vi.hoisted(() =>
  vi.fn(() => {
    const child = {
      pid: 12345,
      on: vi.fn(),
      unref: vi.fn(),
    };
    return child;
  }),
);

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return { ...actual, spawn: spawnSpy };
});

// Mock isTtydAlive to return true so the health check passes
vi.mock("node:net", async () => {
  const actual = await vi.importActual<typeof import("node:net")>("node:net");
  return actual;
});

import { spawnTtyd } from "./ttyd.js";

describe("spawnTtyd flags", () => {
  beforeEach(() => {
    spawnSpy.mockClear();
  });

  it("binds to 127.0.0.1 via -i flag", async () => {
    await spawnTtyd({
      port: 7700,
      workspacePath: "/tmp/ws",
      contextFilePath: "/tmp/ctx.md",
      claudeCommand: "claude",
    });

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const args = spawnSpy.mock.calls[0]![1] as string[];
    const iIdx = args.indexOf("-i");
    expect(iIdx).toBeGreaterThan(-1);
    expect(args[iIdx + 1]).toBe("127.0.0.1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @issuectl/core test -- --grep "binds to 127.0.0.1"`
Expected: FAIL — `-i` flag not found in spawn args.

- [ ] **Step 3: Add `-i 127.0.0.1` to spawn flags**

In `packages/core/src/launch/ttyd.ts`, change line 167 from:

```typescript
    ["-W", "-p", String(port), "-q", "/bin/bash", "-lic", shellCommand],
```

to:

```typescript
    ["-W", "-i", "127.0.0.1", "-p", String(port), "-q", "/bin/bash", "-lic", shellCommand],
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/core test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/launch/ttyd.ts packages/core/src/launch/ttyd.test.ts
git commit -m "security: bind ttyd to 127.0.0.1 — proxy is the network boundary"
```

---

### Task 3: Install `ws` dependency and create terminal proxy module

The proxy module handles both WebSocket upgrade and HTTP asset proxying. The `ws` library provides the WebSocket server/client needed for the upgrade path.

**Files:**
- Modify: `packages/web/package.json`
- Create: `packages/web/lib/terminal-proxy.ts`
- Create: `packages/web/lib/terminal-proxy.test.ts`

- [ ] **Step 1: Install `ws` and its types**

```bash
cd packages/web && pnpm add ws && pnpm add -D @types/ws
```

- [ ] **Step 2: Write the failing tests for proxy helpers**

Create `packages/web/lib/terminal-proxy.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidTerminalPort, proxyHttpRequest } from "./terminal-proxy.js";

// Mock @issuectl/core's getDb and getActiveDeploymentByPort
const mockGetActiveDeploymentByPort = vi.hoisted(() => vi.fn());
const mockGetDb = vi.hoisted(() => vi.fn(() => "fake-db"));

vi.mock("@issuectl/core", () => ({
  getDb: mockGetDb,
  getActiveDeploymentByPort: mockGetActiveDeploymentByPort,
}));

describe("isValidTerminalPort", () => {
  beforeEach(() => {
    mockGetActiveDeploymentByPort.mockReset();
  });

  it("returns true when port has an active deployment", () => {
    mockGetActiveDeploymentByPort.mockReturnValue({ id: 1, ttydPort: 7700 });
    expect(isValidTerminalPort(7700)).toBe(true);
    expect(mockGetActiveDeploymentByPort).toHaveBeenCalledWith("fake-db", 7700);
  });

  it("returns false when no deployment uses the port", () => {
    mockGetActiveDeploymentByPort.mockReturnValue(undefined);
    expect(isValidTerminalPort(9999)).toBe(false);
  });

  it("returns false for NaN port", () => {
    expect(isValidTerminalPort(NaN)).toBe(false);
    expect(mockGetActiveDeploymentByPort).not.toHaveBeenCalled();
  });

  it("returns false for port outside 7700-7799 range", () => {
    expect(isValidTerminalPort(3000)).toBe(false);
    expect(mockGetActiveDeploymentByPort).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @issuectl/web test -- --grep "isValidTerminalPort"`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `terminal-proxy.ts`**

Create `packages/web/lib/terminal-proxy.ts`:

```typescript
import { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { getDb, getActiveDeploymentByPort } from "@issuectl/core";

const PORT_MIN = 7700;
const PORT_MAX = 7799;

/**
 * Validate that a port number is in the ttyd range and belongs to an
 * active deployment. This is the security boundary — only ports with
 * a live deployment row are proxied.
 */
export function isValidTerminalPort(port: number): boolean {
  if (!Number.isFinite(port) || port < PORT_MIN || port > PORT_MAX) {
    return false;
  }
  const db = getDb();
  return getActiveDeploymentByPort(db, port) !== undefined;
}

/**
 * Proxy an HTTP request to a local ttyd instance and return the response.
 * Used by the Route Handlers to forward HTML/JS/CSS asset requests.
 */
export async function proxyHttpRequest(
  port: number,
  path: string,
): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const url = `http://127.0.0.1:${port}${path}`;
  const res = await fetch(url);
  const body = Buffer.from(await res.arrayBuffer());
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { status: res.status, headers, body };
}

/**
 * Rewrite root-relative URLs in ttyd's HTML so asset requests route
 * back through the proxy. ttyd serves paths like `/token`,
 * `/auth_token.js`, etc. that need to become
 * `/api/terminal/{port}/token`, etc.
 */
export function rewriteHtml(html: string, port: number): string {
  const prefix = `/api/terminal/${port}`;
  // Rewrite href="/" and src="/" attributes, but not protocol-relative
  // URLs (//...) or absolute URLs (http://...).
  return html
    .replace(/(href|src|action)="\/(?!\/)/g, `$1="${prefix}/`)
    .replace(/(href|src|action)='\/(?!\/)/g, `$1='${prefix}/`);
}

const wss = new WebSocketServer({ noServer: true });

/**
 * Handle an HTTP upgrade request for a terminal WebSocket. Called from
 * `server.ts`'s `upgrade` event listener.
 */
export function handleUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  port: number,
): void {
  if (!isValidTerminalPort(port)) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (clientWs) => {
    // Connect to the upstream ttyd WebSocket
    const upstream = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    upstream.on("open", () => {
      // Pipe messages bidirectionally
      clientWs.on("message", (data, isBinary) => {
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.send(data, { binary: isBinary });
        }
      });

      upstream.on("message", (data, isBinary) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data, { binary: isBinary });
        }
      });
    });

    // Propagate close in both directions
    clientWs.on("close", () => {
      if (upstream.readyState === WebSocket.OPEN) upstream.close();
    });

    upstream.on("close", () => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });

    // Handle errors
    upstream.on("error", (err) => {
      console.error(`[issuectl] upstream WS error for port ${port}:`, err.message);
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });

    clientWs.on("error", (err) => {
      console.error(`[issuectl] client WS error for port ${port}:`, err.message);
      if (upstream.readyState === WebSocket.OPEN) upstream.close();
    });
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/web test -- --grep "isValidTerminalPort"`
Expected: 4 tests PASS.

- [ ] **Step 6: Add tests for `rewriteHtml`**

Add to `packages/web/lib/terminal-proxy.test.ts`:

```typescript
import { rewriteHtml } from "./terminal-proxy.js";

describe("rewriteHtml", () => {
  it("rewrites href attributes with root-relative paths", () => {
    const input = '<link rel="stylesheet" href="/style.css">';
    const result = rewriteHtml(input, 7700);
    expect(result).toBe('<link rel="stylesheet" href="/api/terminal/7700/style.css">');
  });

  it("rewrites src attributes with root-relative paths", () => {
    const input = '<script src="/auth_token.js"></script>';
    const result = rewriteHtml(input, 7701);
    expect(result).toBe('<script src="/api/terminal/7701/auth_token.js"></script>');
  });

  it("does not rewrite protocol-relative URLs", () => {
    const input = '<script src="//cdn.example.com/lib.js"></script>';
    const result = rewriteHtml(input, 7700);
    expect(result).toBe(input);
  });

  it("does not rewrite absolute URLs", () => {
    const input = '<a href="https://example.com">link</a>';
    const result = rewriteHtml(input, 7700);
    expect(result).toBe(input);
  });

  it("handles single-quoted attributes", () => {
    const input = "<link href='/style.css'>";
    const result = rewriteHtml(input, 7700);
    expect(result).toBe("<link href='/api/terminal/7700/style.css'>");
  });
});
```

- [ ] **Step 7: Run all proxy tests**

Run: `pnpm --filter @issuectl/web test -- --grep "terminal-proxy"`
Expected: All tests PASS (isValidTerminalPort + rewriteHtml).

- [ ] **Step 8: Commit**

```bash
git add packages/web/package.json packages/web/lib/terminal-proxy.ts packages/web/lib/terminal-proxy.test.ts pnpm-lock.yaml
git commit -m "feat: add terminal proxy module with WS upgrade and HTTP helpers"
```

---

### Task 4: Create HTTP proxy Route Handlers

These Route Handlers proxy ttyd's HTML and asset responses through the dashboard's origin.

**Files:**
- Create: `packages/web/app/api/terminal/[port]/route.ts`
- Create: `packages/web/app/api/terminal/[port]/[...path]/route.ts`

- [ ] **Step 1: Create the root route handler**

Create `packages/web/app/api/terminal/[port]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { isValidTerminalPort, proxyHttpRequest, rewriteHtml } from "@/lib/terminal-proxy";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ port: string }> },
): Promise<NextResponse> {
  const { port: portStr } = await params;
  const port = Number(portStr);

  if (!isValidTerminalPort(port)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const upstream = await proxyHttpRequest(port, "/");
    const contentType = upstream.headers["content-type"] ?? "";

    if (contentType.includes("text/html")) {
      const rewritten = rewriteHtml(upstream.body.toString("utf-8"), port);
      return new NextResponse(rewritten, {
        status: upstream.status,
        headers: { "content-type": contentType },
      });
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: { "content-type": contentType },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED")) {
      return new NextResponse("Terminal not available", { status: 502 });
    }
    return new NextResponse("Proxy error", { status: 502 });
  }
}
```

- [ ] **Step 2: Create the catch-all sub-path route handler**

Create `packages/web/app/api/terminal/[port]/[...path]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { isValidTerminalPort, proxyHttpRequest } from "@/lib/terminal-proxy";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ port: string; path: string[] }> },
): Promise<NextResponse> {
  const { port: portStr, path } = await params;
  const port = Number(portStr);

  if (!isValidTerminalPort(port)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const upstreamPath = "/" + path.join("/");

  try {
    const upstream = await proxyHttpRequest(port, upstreamPath);
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers["content-type"] ?? "application/octet-stream" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED")) {
      return new NextResponse("Terminal not available", { status: 502 });
    }
    return new NextResponse("Proxy error", { status: 502 });
  }
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS — no type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/api/terminal/
git commit -m "feat: add HTTP proxy route handlers for ttyd assets"
```

---

### Task 5: Create custom `server.ts`

The custom server wraps Next.js and attaches the WebSocket upgrade handler.

**Files:**
- Create: `packages/web/server.ts`
- Modify: `packages/web/package.json` (scripts)
- Modify: `packages/web/tsconfig.json` (include server.ts for typecheck)

- [ ] **Step 1: Create `server.ts`**

Create `packages/web/server.ts`:

```typescript
import { createServer } from "node:http";
import next from "next";
import { handleUpgrade } from "./lib/terminal-proxy.js";

const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT ?? 3847);

const app = next({ dev, port });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  handle(req, res);
});

server.on("upgrade", (req, socket, head) => {
  const match = req.url?.match(/^\/api\/terminal\/(\d+)\/ws/);
  if (match) {
    handleUpgrade(req, socket, head, Number(match[1]));
  } else {
    // Not a terminal WebSocket — let Next.js handle it (HMR in dev)
    // by NOT destroying the socket. Next.js attaches its own upgrade
    // handler for /_next/webpack-hmr.
  }
});

server.listen(port, () => {
  console.log(`> issuectl dashboard on http://localhost:${port} (${dev ? "dev" : "prod"})`);
});

// Graceful shutdown
function shutdown() {
  console.log("[issuectl] shutting down...");
  server.close(() => {
    process.exit(0);
  });
  // Force exit after 5s if connections don't drain
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

- [ ] **Step 2: Update `package.json` scripts**

In `packages/web/package.json`, change the scripts:

```json
{
  "scripts": {
    "build": "next build",
    "start": "node server.js --port 3847",
    "typecheck": "tsc --noEmit",
    "lint": "eslint app/ components/ lib/",
    "dev": "node --import tsx server.ts --dev",
    "test": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

Note: `dev` uses `tsx` to run TypeScript directly. `start` uses the compiled `server.js` (transpiled by the build step). We need to add `tsx` as a dev dependency and add a build step for server.ts.

Actually, simpler approach — use `tsx` for both dev and prod:

```json
{
  "scripts": {
    "build": "next build",
    "start": "node --import tsx server.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint app/ components/ lib/",
    "dev": "node --import tsx server.ts --dev",
    "test": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

Install tsx:

```bash
cd packages/web && pnpm add -D tsx
```

- [ ] **Step 3: Handle Next.js HMR WebSocket in dev mode**

The `upgrade` handler must not eat HMR upgrade requests. Update the `upgrade` handler in `server.ts` — the code in Step 1 already handles this by only intercepting `/api/terminal/` URLs and leaving everything else for Next.js's internal handler.

However, Next.js attaches its own upgrade handler during `app.prepare()`. The custom server's `upgrade` event fires first. For non-terminal upgrades, we need to re-emit to Next.js's handler. Update the upgrade handler:

```typescript
server.on("upgrade", (req, socket, head) => {
  const match = req.url?.match(/^\/api\/terminal\/(\d+)\/ws/);
  if (match) {
    handleUpgrade(req, socket, head, Number(match[1]));
  }
  // Non-terminal upgrades (HMR, etc.) fall through to Next.js's
  // internally attached upgrade handler — no action needed here.
});
```

This works because Node's `http.Server` supports multiple `upgrade` listeners. Next.js adds its own, and it will fire for requests our handler doesn't consume (since we only call `wss.handleUpgrade` for terminal requests and don't destroy the socket otherwise).

- [ ] **Step 4: Run the dev server manually to verify it starts**

```bash
cd packages/web && node --import tsx server.ts --dev
```

Expected: Console output `> issuectl dashboard on http://localhost:3847 (dev)` and the dashboard loads at `http://localhost:3847`.

Stop the server with Ctrl+C.

- [ ] **Step 5: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/server.ts packages/web/package.json pnpm-lock.yaml
git commit -m "feat: add custom server.ts with WebSocket upgrade handler"
```

---

### Task 6: Update CLI to use custom server

The CLI's `issuectl web` command currently spawns `next dev`. It needs to spawn the custom server instead.

**Files:**
- Modify: `packages/cli/src/commands/web.ts:26-29`

- [ ] **Step 1: Update the spawn command**

In `packages/cli/src/commands/web.ts`, change the child spawn from:

```typescript
  const nextBin = resolve(webPath, "node_modules", ".bin", "next");

  log.info(`Starting dashboard on http://localhost:${port}`);

  const child = spawn(nextBin, ["dev", "--turbopack", "--port", port], {
    cwd: webPath,
    stdio: "inherit",
  });
```

to:

```typescript
  const serverPath = resolve(webPath, "server.ts");

  log.info(`Starting dashboard on http://localhost:${port}`);

  const child = spawn("node", ["--import", "tsx", serverPath, "--dev"], {
    cwd: webPath,
    stdio: "inherit",
    env: { ...process.env, PORT: port },
  });
```

Also update `server.ts` to read port from the `PORT` env var (already done in Task 5 — `Number(process.env.PORT ?? 3847)`).

- [ ] **Step 2: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS.

- [ ] **Step 3: Test manually**

Run: `issuectl web` (or `pnpm --filter @issuectl/cli dev -- web`)
Expected: Dashboard loads at `http://localhost:3847`.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/web.ts
git commit -m "feat: issuectl web now uses custom server with WS proxy support"
```

---

### Task 7: Update TerminalPanel iframe src

Switch the iframe from direct ttyd access to the proxy route.

**Files:**
- Modify: `packages/web/components/terminal/TerminalPanel.tsx:89-93`

- [ ] **Step 1: Change the iframe src**

In `packages/web/components/terminal/TerminalPanel.tsx`, change:

```tsx
        <iframe
          className={styles.terminalFrame}
          src={`http://localhost:${ttydPort}`}
          title={`Terminal — Issue #${issueNumber}`}
        />
```

to:

```tsx
        <iframe
          className={styles.terminalFrame}
          src={`/api/terminal/${ttydPort}/`}
          title={`Terminal — Issue #${issueNumber}`}
        />
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/components/terminal/TerminalPanel.tsx
git commit -m "feat: terminal iframe uses proxy route instead of direct localhost"
```

---

### Task 8: Update CSP and security headers

The `frame-src http://localhost:*` directive is no longer needed since iframes are now same-origin.

**Files:**
- Modify: `packages/web/next.config.ts:106-121`

- [ ] **Step 1: Update the CSP**

In `packages/web/next.config.ts`, change the CSP block. Replace:

```typescript
    // ttyd terminal iframes run on localhost ports 7700-7799. CSP
    // frame-src needs to allow these origins for the embedded terminal
    // panel to load. A single wildcard origin covers the entire range.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://avatars.githubusercontent.com",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-src http://localhost:*",
      "worker-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
```

with:

```typescript
    // Terminal iframes now route through the same-origin proxy at
    // /api/terminal/{port}/, so frame-src 'self' is sufficient.
    // connect-src 'self' covers the proxied WebSocket upgrades.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://avatars.githubusercontent.com",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-src 'self'",
      "worker-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
```

Key change: `frame-src http://localhost:*` → `frame-src 'self'`.

- [ ] **Step 2: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/next.config.ts
git commit -m "security: tighten CSP frame-src to 'self' now that terminals are proxied"
```

---

### Task 9: Integration test — end-to-end proxy flow

Verify the full proxy works: iframe loads through the Route Handler, WebSocket connects through the upgrade handler, and port validation rejects invalid ports.

**Files:**
- Modify: `packages/web/e2e/` (add or extend an e2e spec)

- [ ] **Step 1: Add e2e test for terminal proxy**

Create `packages/web/e2e/terminal-proxy.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("terminal proxy", () => {
  test("returns 404 for invalid port", async ({ request }) => {
    const res = await request.get("/api/terminal/9999/");
    expect(res.status()).toBe(404);
  });

  test("returns 404 for non-numeric port", async ({ request }) => {
    const res = await request.get("/api/terminal/abc/");
    expect(res.status()).toBe(404);
  });

  test("returns 502 when no ttyd is running on a valid-range port", async ({ request }) => {
    // Port 7799 is in range but unlikely to have a deployment
    // This test verifies the proxy attempts to connect and gets ECONNREFUSED
    // Note: this may return 404 if no deployment exists for port 7799,
    // which is also correct behavior (validation rejects it before proxying)
    const res = await request.get("/api/terminal/7799/");
    expect([404, 502]).toContain(res.status());
  });
});
```

- [ ] **Step 2: Run e2e tests**

Start the dev server first (in a separate terminal):
```bash
cd packages/web && node --import tsx server.ts --dev
```

Run e2e:
```bash
pnpm --filter @issuectl/web test:e2e -- terminal-proxy
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/e2e/terminal-proxy.spec.ts
git commit -m "test: add e2e tests for terminal proxy route validation"
```

---

### Task 10: Manual verification — full tunnel flow

This is a manual verification task. It cannot be automated because it requires the Cloudflare tunnel and a real ttyd session.

- [ ] **Step 1: Start the dashboard with the custom server**

```bash
issuectl web
```

- [ ] **Step 2: Launch a terminal session for any issue**

From the dashboard, click "Launch" on an issue to start a ttyd session.

- [ ] **Step 3: Verify local access works**

Open `http://localhost:3847` in a browser. Navigate to the issue. The terminal panel should load via the proxy route (`/api/terminal/{port}/`). Verify:
- Terminal loads and renders
- You can type in the terminal
- Terminal resize works

- [ ] **Step 4: Verify tunnel access works**

Open `https://issuectl.neonwatty.com` in a browser (through the Cloudflare tunnel). Navigate to the same issue. Verify:
- Terminal loads through HTTPS (no mixed content errors)
- Terminal is interactive (WebSocket works through the tunnel)
- Console has no CSP violations

- [ ] **Step 5: Verify port validation**

Open `https://issuectl.neonwatty.com/api/terminal/9999/` — should return 404.
Open `https://issuectl.neonwatty.com/api/terminal/7700/` (with no active deployment on 7700) — should return 404.

- [ ] **Step 6: Final commit if any adjustments were needed**

```bash
git add -A
git commit -m "fix: adjustments from manual tunnel verification"
```
