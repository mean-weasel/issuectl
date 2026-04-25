# LAN Auto-Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically redirect tunnel requests to the LAN IP when the client is on the same home network as the server.

**Architecture:** A new `network-info.ts` module detects the server's public and LAN IPs on startup and refreshes them periodically. A Next.js middleware checks each document request for the `CF-Connecting-IP` header, compares it to the cached public IP, and issues a 302 redirect to the LAN URL on match. The feature is gated on the `ISSUECTL_TUNNEL_URL` env var.

**Tech Stack:** Node.js `os` module, `fetch` (ipify API), Next.js middleware

**Spec:** `docs/superpowers/specs/2026-04-25-lan-auto-switch-design.md`

---

## File Structure

| File | Role |
|---|---|
| `packages/web/lib/network-info.ts` | **New.** Server-side IP resolution — detects public IP (ipify) and LAN IP (`os.networkInterfaces()`), caches in memory, exposes getters and a refresh function |
| `packages/web/lib/network-info.test.ts` | **New.** Unit tests for the network-info module |
| `packages/web/middleware.ts` | **New.** Next.js middleware — checks `CF-Connecting-IP`, redirects to LAN when IPs match |
| `packages/web/middleware.test.ts` | **New.** Unit tests for the middleware redirect logic |
| `packages/web/server.ts` | **Modify.** Call `refreshNetworkInfo()` on startup, set up 30-minute refresh interval |

---

### Task 1: IP Resolution Module — LAN IP Detection

**Files:**
- Create: `packages/web/lib/network-info.ts`
- Create: `packages/web/lib/network-info.test.ts`

- [ ] **Step 1: Write the failing test for `getLanIp()`**

```typescript
// packages/web/lib/network-info.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";

vi.mock("node:os", () => ({
  default: { networkInterfaces: vi.fn() },
  networkInterfaces: vi.fn(),
}));

const mockNetworkInterfaces = vi.mocked(os.networkInterfaces);

// Dynamic import so mocks are in place before the module loads.
// Re-import per test group via resetModules if needed.
const { getLanIp, resetForTesting } = await import("./network-info.js");

describe("getLanIp", () => {
  beforeEach(() => {
    resetForTesting();
    mockNetworkInterfaces.mockReset();
  });

  it("returns null before refresh", () => {
    expect(getLanIp()).toBeNull();
  });
});
```

- [ ] **Step 2: Write minimal `network-info.ts` skeleton with `getLanIp()` and `resetForTesting()`**

```typescript
// packages/web/lib/network-info.ts
import os from "node:os";

let publicIp: string | null = null;
let lanIp: string | null = null;

export function getPublicIp(): string | null {
  return publicIp;
}

export function getLanIp(): string | null {
  return lanIp;
}

/** Detect the first non-internal IPv4 address. */
function detectLanIp(): string | null {
  const interfaces = os.networkInterfaces();
  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal && !addr.address.startsWith("169.254.")) {
        return addr.address;
      }
    }
  }
  return null;
}

export async function refreshNetworkInfo(): Promise<void> {
  lanIp = detectLanIp();
  // Public IP fetch added in Task 2.
}

/** Reset cached state — test-only. */
export function resetForTesting(): void {
  publicIp = null;
  lanIp = null;
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm --filter @issuectl/web test -- --run network-info`
Expected: PASS — `getLanIp()` returns `null` before refresh.

- [ ] **Step 4: Add tests for LAN IP detection after refresh**

Add to the `getLanIp` describe block in `network-info.test.ts`:

```typescript
  it("returns the first non-internal IPv4 after refresh", async () => {
    mockNetworkInterfaces.mockReturnValue({
      en0: [
        { address: "fe80::1", family: "IPv6", internal: false, netmask: "ffff::", mac: "", cidr: null },
        { address: "192.168.1.30", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "", cidr: null },
      ],
      lo0: [
        { address: "127.0.0.1", family: "IPv4", internal: true, netmask: "255.0.0.0", mac: "", cidr: null },
      ],
    });

    // refreshNetworkInfo also fetches public IP — mock fetch to avoid real network call.
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("no network"));

    const { refreshNetworkInfo: refresh } = await import("./network-info.js");
    await refresh();

    expect(getLanIp()).toBe("192.168.1.30");
  });

  it("skips link-local addresses", async () => {
    mockNetworkInterfaces.mockReturnValue({
      en0: [
        { address: "169.254.1.1", family: "IPv4", internal: false, netmask: "255.255.0.0", mac: "", cidr: null },
      ],
    });

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("no network"));

    const { refreshNetworkInfo: refresh } = await import("./network-info.js");
    await refresh();

    expect(getLanIp()).toBeNull();
  });

  it("returns null when no interfaces available", async () => {
    mockNetworkInterfaces.mockReturnValue({});

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("no network"));

    const { refreshNetworkInfo: refresh } = await import("./network-info.js");
    await refresh();

    expect(getLanIp()).toBeNull();
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/web test -- --run network-info`
Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/lib/network-info.ts packages/web/lib/network-info.test.ts
git commit -m "feat(web): add LAN IP detection in network-info module (#228)"
```

---

### Task 2: IP Resolution Module — Public IP Detection

**Files:**
- Modify: `packages/web/lib/network-info.ts`
- Modify: `packages/web/lib/network-info.test.ts`

- [ ] **Step 1: Add failing tests for public IP detection**

Add a new describe block in `network-info.test.ts`:

```typescript
describe("getPublicIp", () => {
  beforeEach(() => {
    resetForTesting();
    mockNetworkInterfaces.mockReturnValue({});
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null before refresh", () => {
    expect(getPublicIp()).toBeNull();
  });

  it("returns the public IP after a successful refresh", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("203.0.113.42"),
    });

    const { refreshNetworkInfo: refresh } = await import("./network-info.js");
    await refresh();

    expect(getPublicIp()).toBe("203.0.113.42");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.ipify.org",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns null when ipify returns a non-ok response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("error"),
    });

    const { refreshNetworkInfo: refresh } = await import("./network-info.js");
    await refresh();

    expect(getPublicIp()).toBeNull();
  });

  it("returns null when fetch throws (no network)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));

    const { refreshNetworkInfo: refresh } = await import("./network-info.js");
    await refresh();

    expect(getPublicIp()).toBeNull();
  });
});
```

Also update the imports at the top to include `getPublicIp` and `afterEach`:

```typescript
const { getLanIp, getPublicIp, resetForTesting } = await import("./network-info.js");
```

- [ ] **Step 2: Run tests to verify the new tests fail**

Run: `pnpm --filter @issuectl/web test -- --run network-info`
Expected: The `getPublicIp` tests that call `refresh()` fail because `refreshNetworkInfo` doesn't fetch the public IP yet.

- [ ] **Step 3: Implement public IP fetch in `refreshNetworkInfo()`**

Update `refreshNetworkInfo()` in `network-info.ts`:

```typescript
const IPIFY_URL = "https://api.ipify.org";
const FETCH_TIMEOUT_MS = 5_000;

async function detectPublicIp(): Promise<string | null> {
  try {
    const res = await fetch(IPIFY_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.trim() || null;
  } catch {
    return null;
  }
}

export async function refreshNetworkInfo(): Promise<void> {
  lanIp = detectLanIp();
  publicIp = await detectPublicIp();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/web test -- --run network-info`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/lib/network-info.ts packages/web/lib/network-info.test.ts
git commit -m "feat(web): add public IP detection via ipify (#228)"
```

---

### Task 3: Next.js Middleware — Redirect Logic

**Files:**
- Create: `packages/web/middleware.ts`
- Create: `packages/web/middleware.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/web/middleware.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetPublicIp = vi.hoisted(() => vi.fn<() => string | null>());
const mockGetLanIp = vi.hoisted(() => vi.fn<() => string | null>());

vi.mock("./lib/network-info.js", () => ({
  getPublicIp: mockGetPublicIp,
  getLanIp: mockGetLanIp,
}));

const { middleware } = await import("./middleware.js");

function makeRequest(url: string, headers?: Record<string, string>): NextRequest {
  const req = new NextRequest(new URL(url), {
    headers: new Headers(headers),
  });
  return req;
}

describe("middleware", () => {
  beforeEach(() => {
    mockGetPublicIp.mockReset();
    mockGetLanIp.mockReset();
    // Set the env var so the feature is enabled.
    process.env.ISSUECTL_TUNNEL_URL = "https://issuectl.neonwatty.com";
  });

  it("passes through when ISSUECTL_TUNNEL_URL is not set", () => {
    delete process.env.ISSUECTL_TUNNEL_URL;
    mockGetPublicIp.mockReturnValue("203.0.113.42");
    mockGetLanIp.mockReturnValue("192.168.1.30");

    const res = middleware(makeRequest("https://issuectl.neonwatty.com/", {
      "cf-connecting-ip": "203.0.113.42",
    }));

    expect(res.headers.get("location")).toBeNull();
    expect(res.status).not.toBe(302);
  });

  it("passes through when no CF-Connecting-IP header", () => {
    mockGetPublicIp.mockReturnValue("203.0.113.42");
    mockGetLanIp.mockReturnValue("192.168.1.30");

    const res = middleware(makeRequest("https://issuectl.neonwatty.com/"));

    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through when public IP is unknown", () => {
    mockGetPublicIp.mockReturnValue(null);
    mockGetLanIp.mockReturnValue("192.168.1.30");

    const res = middleware(makeRequest("https://issuectl.neonwatty.com/", {
      "cf-connecting-ip": "203.0.113.42",
    }));

    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through when LAN IP is unknown", () => {
    mockGetPublicIp.mockReturnValue("203.0.113.42");
    mockGetLanIp.mockReturnValue(null);

    const res = middleware(makeRequest("https://issuectl.neonwatty.com/", {
      "cf-connecting-ip": "203.0.113.42",
    }));

    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through when client IP does not match server public IP", () => {
    mockGetPublicIp.mockReturnValue("203.0.113.42");
    mockGetLanIp.mockReturnValue("192.168.1.30");

    const res = middleware(makeRequest("https://issuectl.neonwatty.com/issues", {
      "cf-connecting-ip": "198.51.100.99",
    }));

    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects to LAN IP when client IP matches server public IP", () => {
    mockGetPublicIp.mockReturnValue("203.0.113.42");
    mockGetLanIp.mockReturnValue("192.168.1.30");

    const res = middleware(makeRequest("https://issuectl.neonwatty.com/issues?label=bug", {
      "cf-connecting-ip": "203.0.113.42",
    }));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://192.168.1.30:3847/issues?label=bug");
  });

  it("preserves the root path in redirect", () => {
    mockGetPublicIp.mockReturnValue("203.0.113.42");
    mockGetLanIp.mockReturnValue("192.168.1.30");

    const res = middleware(makeRequest("https://issuectl.neonwatty.com/", {
      "cf-connecting-ip": "203.0.113.42",
    }));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://192.168.1.30:3847/");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @issuectl/web test -- --run middleware`
Expected: FAIL — `middleware.ts` does not exist yet.

- [ ] **Step 3: Implement the middleware**

```typescript
// packages/web/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { getPublicIp, getLanIp } from "./lib/network-info.js";

const port = Number(process.env.PORT ?? 3847);

export function middleware(request: NextRequest): NextResponse {
  if (!process.env.ISSUECTL_TUNNEL_URL) {
    return NextResponse.next();
  }

  const clientIp = request.headers.get("cf-connecting-ip");
  if (!clientIp) {
    return NextResponse.next();
  }

  const serverPublicIp = getPublicIp();
  const serverLanIp = getLanIp();
  if (!serverPublicIp || !serverLanIp) {
    return NextResponse.next();
  }

  if (clientIp !== serverPublicIp) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  const lanUrl = `http://${serverLanIp}:${port}${url.pathname}${url.search}`;
  return NextResponse.redirect(lanUrl, 302);
}

export const config = {
  matcher: [
    "/((?!_next|api|favicon|icon|apple-touch-icon|manifest|sw|offline).*)",
  ],
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/web test -- --run middleware`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/middleware.ts packages/web/middleware.test.ts
git commit -m "feat(web): add LAN auto-switch middleware (#228)"
```

---

### Task 4: Server Startup Integration

**Files:**
- Modify: `packages/web/server.ts`

- [ ] **Step 1: Add `refreshNetworkInfo()` call and refresh interval to `server.ts`**

Add the import at the top of `server.ts`, after the existing imports:

```typescript
import { refreshNetworkInfo, getPublicIp, getLanIp } from "./lib/network-info.js";
```

Add the refresh call and interval before `server.listen()`. Replace the existing `server.listen()` block:

```typescript
// Detect network IPs for LAN auto-switch (non-blocking — failure disables the feature).
await refreshNetworkInfo();

server.listen(port, () => {
  const lanIp = getLanIp();
  const publicIp = getPublicIp();
  console.log(`> issuectl dashboard on http://localhost:${port} (${dev ? "dev" : "prod"})`);
  if (lanIp && publicIp) {
    console.log(`> LAN auto-switch: public=${publicIp}, lan=${lanIp}`);
  } else {
    console.log("> LAN auto-switch: disabled (could not detect IPs)");
  }
});

// Refresh IPs every 30 minutes to handle DHCP/ISP changes.
const IP_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
setInterval(refreshNetworkInfo, IP_REFRESH_INTERVAL_MS).unref();
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS — no type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/server.ts
git commit -m "feat(web): integrate network-info refresh into server startup (#228)"
```

---

### Task 5: Full Test Suite & Typecheck

**Files:**
- All files from Tasks 1–4

- [ ] **Step 1: Run the full web package test suite**

Run: `pnpm --filter @issuectl/web test -- --run`
Expected: All tests PASS (including pre-existing tests — no regressions).

- [ ] **Step 2: Run typecheck across the monorepo**

Run: `pnpm turbo typecheck`
Expected: PASS.

- [ ] **Step 3: Run the build**

Run: `pnpm turbo build`
Expected: PASS. The middleware is picked up by Next.js at build time.

- [ ] **Step 4: Fix any issues found in steps 1–3**

If any test, typecheck, or build fails, fix the issue and re-run. Do not proceed until all three pass.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(web): address test/build issues from LAN auto-switch (#228)"
```

Skip this commit if steps 1–3 passed cleanly.
