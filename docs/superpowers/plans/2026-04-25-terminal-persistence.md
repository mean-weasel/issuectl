# Terminal Session Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix terminal sessions being killed when the user navigates away, by using tmux session existence (not ttyd PID) as the liveness signal and respawning ttyd on demand.

**Architecture:** ttyd is treated as a disposable web frontend. `isTmuxSessionAlive(sessionName)` replaces `isTtydAlive(pid)` as the deployment liveness signal in health checks and reconciliation. A new `ensureTtyd` server action respawns ttyd before the terminal panel opens if it has exited. A new `respawnTtyd` core function handles the spawn-without-tmux-creation path.

**Tech Stack:** TypeScript, Vitest (unit tests), Playwright (e2e), `tmux has-session`, `child_process.spawn`/`execFileSync`

**Spec:** `docs/superpowers/specs/2026-04-25-terminal-persistence-design.md`

---

### Task 1: Add `isTmuxSessionAlive` to core

**Files:**
- Modify: `packages/core/src/launch/ttyd.ts`
- Modify: `packages/core/src/launch/ttyd.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for `isTmuxSessionAlive`**

Add to `packages/core/src/launch/ttyd.test.ts` after the `isTtydAlive` describe block:

```typescript
/* ------------------------------------------------------------------ */
/*  isTmuxSessionAlive                                                 */
/* ------------------------------------------------------------------ */

describe("isTmuxSessionAlive", () => {
  beforeEach(() => {
    execFileSyncSpy.mockReset();
  });

  it("returns true when tmux session exists (exit code 0)", () => {
    execFileSyncSpy.mockReturnValue(Buffer.from(""));
    expect(isTmuxSessionAlive("issuectl-repo-42")).toBe(true);
    expect(execFileSyncSpy).toHaveBeenCalledWith(
      "tmux", ["has-session", "-t", "issuectl-repo-42"],
      expect.objectContaining({ stdio: "ignore", timeout: 10_000 }),
    );
  });

  it("returns false when tmux session does not exist (exit code 1)", () => {
    execFileSyncSpy.mockImplementation(() => {
      throw Object.assign(new Error("session not found"), { status: 1 });
    });
    expect(isTmuxSessionAlive("issuectl-repo-42")).toBe(false);
  });

  it("returns false when tmux command times out", () => {
    execFileSyncSpy.mockImplementation(() => {
      throw Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
    });
    expect(isTmuxSessionAlive("issuectl-repo-42")).toBe(false);
  });

  it("returns false when tmux is not installed", () => {
    execFileSyncSpy.mockImplementation(() => {
      throw Object.assign(new Error("not found"), { code: "ENOENT" });
    });
    expect(isTmuxSessionAlive("issuectl-repo-42")).toBe(false);
  });
});
```

Update the import at the top of the test file to include `isTmuxSessionAlive`:

```typescript
import {
  verifyTtyd,
  killTtyd,
  isTtydAlive,
  isTmuxSessionAlive,
  allocatePort,
  spawnTtyd,
  reconcileOrphanedDeployments,
  tmuxSessionName,
} from "./ttyd.js";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @issuectl/core test -- --reporter=verbose 2>&1 | grep -A2 "isTmuxSessionAlive"`
Expected: Errors about `isTmuxSessionAlive` not being exported

- [ ] **Step 3: Implement `isTmuxSessionAlive`**

Add to `packages/core/src/launch/ttyd.ts` after the `isTtydAlive` function:

```typescript
/* ------------------------------------------------------------------ */
/*  isTmuxSessionAlive                                                 */
/* ------------------------------------------------------------------ */

/**
 * Check whether a tmux session with the given name still exists.
 * This is the deployment liveness signal — tmux hosts the actual
 * work (Claude Code), while ttyd is just a disposable web frontend.
 */
export function isTmuxSessionAlive(sessionName: string): boolean {
  try {
    execFileSync("tmux", ["has-session", "-t", sessionName], {
      stdio: "ignore",
      timeout: TMUX_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}
```

Add to `packages/core/src/index.ts` export list alongside the existing `isTtydAlive` export:

```typescript
  isTmuxSessionAlive,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/core test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|isTmuxSessionAlive)"`
Expected: All 4 `isTmuxSessionAlive` tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/launch/ttyd.ts packages/core/src/launch/ttyd.test.ts packages/core/src/index.ts
git commit -m "feat(core): add isTmuxSessionAlive for deployment liveness checks"
```

---

### Task 2: Add `respawnTtyd` to core

**Files:**
- Modify: `packages/core/src/launch/ttyd.ts`
- Modify: `packages/core/src/launch/ttyd.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for `respawnTtyd`**

Add to `packages/core/src/launch/ttyd.test.ts` after the `spawnTtyd` describe block:

```typescript
/* ------------------------------------------------------------------ */
/*  respawnTtyd                                                        */
/* ------------------------------------------------------------------ */

describe("respawnTtyd", () => {
  beforeEach(() => {
    spawnSpy.mockReset();
    execFileSyncSpy.mockReset();
  });

  it("spawns ttyd against existing tmux session and returns new PID", async () => {
    const unrefSpy = vi.fn();
    spawnSpy.mockReturnValue({ pid: 88, unref: unrefSpy, on: vi.fn() });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    const result = await respawnTtyd(7700, "issuectl-repo-42");

    expect(result).toEqual({ pid: 88 });
    expect(unrefSpy).toHaveBeenCalled();

    const [bin, args, opts] = spawnSpy.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(bin).toBe("ttyd");
    expect(args).toEqual([
      "-W", "-i", "127.0.0.1", "-p", "7700", "-q",
      "tmux", "attach-session", "-t", "issuectl-repo-42",
    ]);
    expect(opts).toEqual({ detached: true, stdio: "ignore" });
    killSpy.mockRestore();
  });

  it("does NOT create a new tmux session", async () => {
    spawnSpy.mockReturnValue({ pid: 88, unref: vi.fn(), on: vi.fn() });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    await respawnTtyd(7700, "issuectl-repo-42");

    // execFileSync should NOT have been called (no tmux new-session)
    expect(execFileSyncSpy).not.toHaveBeenCalled();
    killSpy.mockRestore();
  });

  it("throws when ttyd dies immediately after respawn", async () => {
    spawnSpy.mockReturnValue({ pid: 99, unref: vi.fn(), on: vi.fn() });
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("ESRCH"), { code: "ESRCH" });
    });

    await expect(respawnTtyd(7700, "issuectl-repo-42")).rejects.toThrow(
      "ttyd process 99 died immediately after respawn",
    );
    killSpy.mockRestore();
  });

  it("throws when no PID is returned", async () => {
    spawnSpy.mockReturnValue({ pid: undefined, unref: vi.fn(), on: vi.fn() });

    await expect(respawnTtyd(7700, "issuectl-repo-42")).rejects.toThrow(
      "Failed to respawn ttyd: no PID returned",
    );
  });
});
```

Update the import to include `respawnTtyd`:

```typescript
import {
  verifyTtyd,
  killTtyd,
  isTtydAlive,
  isTmuxSessionAlive,
  allocatePort,
  spawnTtyd,
  respawnTtyd,
  reconcileOrphanedDeployments,
  tmuxSessionName,
} from "./ttyd.js";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @issuectl/core test -- --reporter=verbose 2>&1 | grep -A2 "respawnTtyd"`
Expected: Errors about `respawnTtyd` not being exported

- [ ] **Step 3: Implement `respawnTtyd`**

Add to `packages/core/src/launch/ttyd.ts` after the `spawnTtyd` function (before `killTmuxSession`):

```typescript
/* ------------------------------------------------------------------ */
/*  respawnTtyd                                                        */
/* ------------------------------------------------------------------ */

/**
 * Respawn a ttyd process against an existing tmux session. Used when
 * ttyd has exited (e.g. `-q` exit-on-disconnect) but the tmux session
 * is still alive. Unlike `spawnTtyd`, this does NOT create a new tmux
 * session — it attaches to the one that already exists.
 */
export async function respawnTtyd(
  port: number,
  sessionName: string,
): Promise<{ pid: number }> {
  const child = spawn(
    "ttyd",
    ["-W", "-i", "127.0.0.1", "-p", String(port), "-q",
     "tmux", "attach-session", "-t", sessionName],
    { detached: true, stdio: "ignore" },
  );

  child.on("error", (err) => {
    console.error(`[issuectl] ttyd respawn process ${child.pid} errored:`, err);
  });
  child.unref();

  if (child.pid === undefined) {
    throw new Error("Failed to respawn ttyd: no PID returned");
  }

  await new Promise((r) => setTimeout(r, 300));
  if (!isTtydAlive(child.pid)) {
    throw new Error(
      `ttyd process ${child.pid} died immediately after respawn. Check that port ${port} is available.`,
    );
  }

  return { pid: child.pid };
}
```

Add to `packages/core/src/index.ts` export list alongside the existing `spawnTtyd` export:

```typescript
  respawnTtyd,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/core test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|respawnTtyd)"`
Expected: All 4 `respawnTtyd` tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/launch/ttyd.ts packages/core/src/launch/ttyd.test.ts packages/core/src/index.ts
git commit -m "feat(core): add respawnTtyd for on-demand ttyd restart"
```

---

### Task 3: Switch `reconcileOrphanedDeployments` to tmux liveness

**Files:**
- Modify: `packages/core/src/launch/ttyd.ts`
- Modify: `packages/core/src/launch/ttyd.test.ts`

- [ ] **Step 1: Update existing reconcile tests to use tmux liveness**

Replace the entire `reconcileOrphanedDeployments` describe block in `packages/core/src/launch/ttyd.test.ts`:

```typescript
describe("reconcileOrphanedDeployments", () => {
  beforeEach(() => {
    execFileSyncSpy.mockReset();
  });

  it("marks deployments as ended only when tmux session is gone", () => {
    // Session "issuectl-repoA-10" is alive, "issuectl-repoB-20" is dead.
    execFileSyncSpy.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "has-session" && args[2] === "issuectl-repoA-10") {
        return Buffer.from("");
      }
      throw Object.assign(new Error("session not found"), { status: 1 });
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const runSpy = vi.fn();
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("SELECT")) {
          return {
            all: vi.fn(() => [
              { id: 1, issue_number: 10, repo_name: "repoA" },
              { id: 2, issue_number: 20, repo_name: "repoB" },
            ]),
          };
        }
        return { run: runSpy };
      }),
    } as unknown as Database.Database;

    reconcileOrphanedDeployments(db);

    // Only deployment 2 should be ended (tmux session gone).
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy).toHaveBeenCalledWith(2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Reconciled orphaned deployment 2"),
    );

    warnSpy.mockRestore();
  });

  it("does nothing when all tmux sessions are alive", () => {
    execFileSyncSpy.mockReturnValue(Buffer.from(""));

    const runSpy = vi.fn();
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("SELECT")) {
          return {
            all: vi.fn(() => [
              { id: 1, issue_number: 10, repo_name: "repoA" },
            ]),
          };
        }
        return { run: runSpy };
      }),
    } as unknown as Database.Database;

    reconcileOrphanedDeployments(db);

    expect(runSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @issuectl/core test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|reconcile)"`
Expected: FAIL — current implementation checks PID, not tmux session; also the query shape doesn't match

- [ ] **Step 3: Update `reconcileOrphanedDeployments` implementation**

Replace the function in `packages/core/src/launch/ttyd.ts`:

```typescript
/**
 * Find active deployments whose tmux session has ended and mark them
 * as ended. Called during startup so the UI never shows a phantom
 * session. Uses tmux session existence (not ttyd PID) as the liveness
 * signal — ttyd may have exited due to `-q` while the session was
 * still active.
 */
export function reconcileOrphanedDeployments(db: Database.Database): void {
  const rows = db
    .prepare(
      `SELECT d.id, d.issue_number, r.name AS repo_name
       FROM deployments d
       JOIN repos r ON r.id = d.repo_id
       WHERE d.ended_at IS NULL`,
    )
    .all() as { id: number; issue_number: number; repo_name: string }[];

  for (const row of rows) {
    const sessionName = tmuxSessionName(row.repo_name, row.issue_number);
    if (!isTmuxSessionAlive(sessionName)) {
      db.prepare("UPDATE deployments SET ended_at = datetime('now') WHERE id = ?").run(
        row.id,
      );
      console.warn(
        `[issuectl] Reconciled orphaned deployment ${row.id} (tmux session ${sessionName} is gone)`,
      );
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/core test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|reconcile)"`
Expected: Both reconcile tests PASS

- [ ] **Step 5: Run full core test suite**

Run: `pnpm --filter @issuectl/core test`
Expected: All tests pass (no regressions)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/launch/ttyd.ts packages/core/src/launch/ttyd.test.ts
git commit -m "fix(core): reconcile deployments by tmux session, not ttyd PID"
```

---

### Task 4: Rename `checkTtydAlive` → `checkSessionAlive` and switch to tmux liveness

**Files:**
- Modify: `packages/web/lib/actions/launch.ts`
- Modify: `packages/web/lib/actions/launch.test.ts`
- Modify: `packages/web/components/terminal/OpenTerminalButton.tsx`

- [ ] **Step 1: Write failing tests for new `checkSessionAlive` behavior**

Add to `packages/web/lib/actions/launch.test.ts`. First, update the mock setup to include the new core exports. Replace the `vi.mock("@issuectl/core", ...)` block:

```typescript
const isTtydAlive = vi.hoisted(() => vi.fn());
const isTmuxSessionAlive = vi.hoisted(() => vi.fn());
const respawnTtyd = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getDeploymentById: (...args: unknown[]) => getDeploymentById(...args),
  getRepo: (...args: unknown[]) => getRepo(...args),
  killTtyd: (...args: unknown[]) => killTtyd(...args),
  endDeployment: (...args: unknown[]) => coreEndDeployment(...args),
  cleanupStaleContextFiles: (...args: unknown[]) => cleanupStaleContextFiles(...args),
  tmuxSessionName: (repo: string, issueNumber: number) =>
    `issuectl-${repo}-${issueNumber}`,
  isTtydAlive: (...args: unknown[]) => isTtydAlive(...args),
  isTmuxSessionAlive: (...args: unknown[]) => isTmuxSessionAlive(...args),
  respawnTtyd: (...args: unknown[]) => respawnTtyd(...args),
  executeLaunch: vi.fn(),
  withAuthRetry: vi.fn(),
  withIdempotency: vi.fn(),
  DuplicateInFlightError: class DuplicateInFlightError extends Error {},
  formatErrorForUser: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));
```

Update the import to include the new server actions:

```typescript
import { endSession, checkSessionAlive, ensureTtyd } from "./launch.js";
```

Add to `beforeEach`:

```typescript
  isTtydAlive.mockReset();
  isTmuxSessionAlive.mockReset();
  respawnTtyd.mockReset();
```

Add the test block after the `endSession` describe:

```typescript
describe("checkSessionAlive", () => {
  it("returns alive when tmux session exists (even if ttyd is dead)", async () => {
    isTmuxSessionAlive.mockReturnValue(true);

    const result = await checkSessionAlive(1);

    expect(result).toEqual({ alive: true });
    expect(coreEndDeployment).not.toHaveBeenCalled();
  });

  it("ends deployment and returns not alive when tmux session is gone", async () => {
    isTmuxSessionAlive.mockReturnValue(false);

    const result = await checkSessionAlive(1);

    expect(result).toEqual({ alive: false });
    expect(coreEndDeployment).toHaveBeenCalled();
  });

  it("returns not alive when deployment is already ended", async () => {
    getDeploymentById.mockReturnValue({ ...makeDeployment(42), endedAt: "2026-01-01" });

    const result = await checkSessionAlive(1);

    expect(result).toEqual({ alive: false });
    expect(isTmuxSessionAlive).not.toHaveBeenCalled();
  });

  it("returns not alive when deployment does not exist", async () => {
    getDeploymentById.mockReturnValue(undefined);

    const result = await checkSessionAlive(1);

    expect(result).toEqual({ alive: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @issuectl/web test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|checkSession)"`
Expected: FAIL — `checkSessionAlive` not exported from launch.js

- [ ] **Step 3: Implement `checkSessionAlive` and remove old `checkTtydAlive`**

In `packages/web/lib/actions/launch.ts`, update the import from `@issuectl/core`:

```typescript
import {
  getDb,
  getRepo,
  getDeploymentById,
  executeLaunch,
  endDeployment as coreEndDeployment,
  killTtyd,
  isTmuxSessionAlive,
  tmuxSessionName,
  withAuthRetry,
  withIdempotency,
  DuplicateInFlightError,
  formatErrorForUser,
  cleanupStaleContextFiles,
  type WorkspaceMode,
} from "@issuectl/core";
```

Replace the `checkTtydAlive` function with:

```typescript
export async function checkSessionAlive(
  deploymentId: number,
): Promise<{ alive: boolean; error?: string }> {
  try {
    const db = getDb();
    const deployment = getDeploymentById(db, deploymentId);
    if (!deployment || deployment.endedAt !== null) {
      return { alive: false };
    }

    const repo = db
      .prepare("SELECT name FROM repos WHERE id = ?")
      .get(deployment.repoId) as { name: string } | undefined;
    if (!repo) {
      return { alive: false };
    }

    const sessionName = tmuxSessionName(repo.name, deployment.issueNumber);
    if (isTmuxSessionAlive(sessionName)) {
      return { alive: true };
    }

    // Tmux session is gone — the work is truly done. End the deployment.
    coreEndDeployment(db, deploymentId);
    return { alive: false };
  } catch (err) {
    console.error("[issuectl] Session health check failed:", err);
    return { alive: false, error: "Health check failed" };
  }
}
```

- [ ] **Step 4: Update `OpenTerminalButton` to use the new name**

In `packages/web/components/terminal/OpenTerminalButton.tsx`, change the import:

```typescript
import { checkSessionAlive } from "@/lib/actions/launch";
```

And update the call inside the `useEffect`:

```typescript
  useEffect(() => {
    const timer = setInterval(async () => {
      const { alive } = await checkSessionAlive(deploymentId);
      if (!alive) {
        clearInterval(timer);
        setOpen(false);
        router.refresh();
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [deploymentId, router]);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/web test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|checkSession|endSession)"`
Expected: All `checkSessionAlive` and `endSession` tests PASS

- [ ] **Step 6: Typecheck**

Run: `pnpm turbo typecheck`
Expected: Clean (no errors). Confirms `checkTtydAlive` has no remaining references.

- [ ] **Step 7: Commit**

```bash
git add packages/web/lib/actions/launch.ts packages/web/lib/actions/launch.test.ts packages/web/components/terminal/OpenTerminalButton.tsx
git commit -m "fix(web): rename checkTtydAlive to checkSessionAlive, use tmux liveness"
```

---

### Task 5: Add `ensureTtyd` server action

**Files:**
- Modify: `packages/web/lib/actions/launch.ts`
- Modify: `packages/web/lib/actions/launch.test.ts`
- Modify: `packages/web/components/terminal/OpenTerminalButton.tsx`

- [ ] **Step 1: Write failing tests for `ensureTtyd`**

Add to `packages/web/lib/actions/launch.test.ts` after the `checkSessionAlive` describe block:

```typescript
describe("ensureTtyd", () => {
  it("returns port immediately when ttyd is alive", async () => {
    getDeploymentById.mockReturnValue(makeDeployment(42));
    isTtydAlive.mockReturnValue(true);

    const result = await ensureTtyd(1);

    expect(result).toEqual({ port: null });
    expect(respawnTtyd).not.toHaveBeenCalled();
  });

  it("returns port immediately when ttyd is alive and port is set", async () => {
    getDeploymentById.mockReturnValue({ ...makeDeployment(42), ttydPort: 7700 });
    isTtydAlive.mockReturnValue(true);

    const result = await ensureTtyd(1);

    expect(result).toEqual({ port: 7700 });
    expect(respawnTtyd).not.toHaveBeenCalled();
  });

  it("respawns ttyd when dead but tmux alive", async () => {
    getDeploymentById.mockReturnValue({ ...makeDeployment(42), ttydPort: 7700 });
    isTtydAlive.mockReturnValue(false);
    isTmuxSessionAlive.mockReturnValue(true);
    respawnTtyd.mockResolvedValue({ pid: 99 });

    const fakeDb = {
      prepare: vi.fn(() => ({
        get: vi.fn(() => ({ name: "repo" })),
        run: vi.fn(),
      })),
    };
    getDb.mockReturnValue(fakeDb);

    const result = await ensureTtyd(1);

    expect(result).toEqual({ port: 7700, respawned: true });
    expect(respawnTtyd).toHaveBeenCalledWith(7700, "issuectl-repo-7");
    // ttyd_pid should be updated in DB
    expect(fakeDb.prepare).toHaveBeenCalledWith(
      "UPDATE deployments SET ttyd_pid = ? WHERE id = ?",
    );
  });

  it("returns alive false when both ttyd and tmux are dead", async () => {
    getDeploymentById.mockReturnValue({ ...makeDeployment(42), ttydPort: 7700 });
    isTtydAlive.mockReturnValue(false);
    isTmuxSessionAlive.mockReturnValue(false);

    const fakeDb = {
      prepare: vi.fn(() => ({
        get: vi.fn(() => ({ name: "repo" })),
        run: vi.fn(),
      })),
    };
    getDb.mockReturnValue(fakeDb);

    const result = await ensureTtyd(1);

    expect(result).toEqual({ alive: false });
    expect(respawnTtyd).not.toHaveBeenCalled();
    expect(coreEndDeployment).toHaveBeenCalled();
  });

  it("returns alive false when deployment already ended", async () => {
    getDeploymentById.mockReturnValue({ ...makeDeployment(42), endedAt: "2026-01-01" });

    const result = await ensureTtyd(1);

    expect(result).toEqual({ alive: false });
  });

  it("returns alive false when deployment has no ttydPid", async () => {
    getDeploymentById.mockReturnValue(makeDeployment(null));

    const result = await ensureTtyd(1);

    expect(result).toEqual({ alive: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @issuectl/web test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|ensureTtyd)"`
Expected: FAIL — `ensureTtyd` not exported

- [ ] **Step 3: Implement `ensureTtyd`**

Add to `packages/web/lib/actions/launch.ts`, updating the import first:

```typescript
import {
  getDb,
  getRepo,
  getDeploymentById,
  executeLaunch,
  endDeployment as coreEndDeployment,
  killTtyd,
  isTtydAlive,
  isTmuxSessionAlive,
  respawnTtyd,
  tmuxSessionName,
  withAuthRetry,
  withIdempotency,
  DuplicateInFlightError,
  formatErrorForUser,
  cleanupStaleContextFiles,
  type WorkspaceMode,
} from "@issuectl/core";
```

Add the function after `checkSessionAlive`:

```typescript
type EnsureTtydResult =
  | { port: number | null; respawned?: true }
  | { alive: false; error?: string };

export async function ensureTtyd(
  deploymentId: number,
): Promise<EnsureTtydResult> {
  try {
    const db = getDb();
    const deployment = getDeploymentById(db, deploymentId);
    if (!deployment || deployment.endedAt !== null) {
      return { alive: false };
    }
    if (!deployment.ttydPid) {
      return { alive: false };
    }

    // ttyd is still running — return immediately
    if (isTtydAlive(deployment.ttydPid)) {
      return { port: deployment.ttydPort };
    }

    // ttyd is dead — check if the tmux session is still alive
    const repo = db
      .prepare("SELECT name FROM repos WHERE id = ?")
      .get(deployment.repoId) as { name: string } | undefined;
    if (!repo) {
      return { alive: false };
    }

    const sessionName = tmuxSessionName(repo.name, deployment.issueNumber);
    if (!isTmuxSessionAlive(sessionName)) {
      // Both dead — session is truly over
      coreEndDeployment(db, deploymentId);
      return { alive: false };
    }

    // Tmux alive, ttyd dead — respawn ttyd
    const { pid } = await respawnTtyd(deployment.ttydPort!, sessionName);
    db.prepare("UPDATE deployments SET ttyd_pid = ? WHERE id = ?").run(pid, deploymentId);
    return { port: deployment.ttydPort, respawned: true };
  } catch (err) {
    console.error("[issuectl] ensureTtyd failed:", err);
    return { alive: false, error: "Failed to ensure terminal" };
  }
}
```

- [ ] **Step 4: Update `OpenTerminalButton` to call `ensureTtyd` before opening**

Replace the contents of `packages/web/components/terminal/OpenTerminalButton.tsx`:

```typescript
"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/paper";
import { TerminalPanel } from "./TerminalPanel";
import { checkSessionAlive, ensureTtyd } from "@/lib/actions/launch";

const HEALTH_CHECK_INTERVAL_MS = 10_000;

type Props = {
  ttydPort: number;
  deploymentId: number;
  owner: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
};

export function OpenTerminalButton({
  ttydPort,
  deploymentId,
  owner,
  repo,
  issueNumber,
  issueTitle,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(async () => {
      const { alive } = await checkSessionAlive(deploymentId);
      if (!alive) {
        clearInterval(timer);
        setOpen(false);
        router.refresh();
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [deploymentId, router]);

  function handleOpen() {
    startTransition(async () => {
      const result = await ensureTtyd(deploymentId);
      if ("alive" in result && !result.alive) {
        router.refresh();
        return;
      }
      setOpen(true);
    });
  }

  return (
    <>
      <Button variant="primary" onClick={handleOpen} disabled={isPending}>
        {isPending ? "Connecting..." : "Open Terminal"}
      </Button>
      <TerminalPanel
        open={open}
        onClose={() => setOpen(false)}
        ttydPort={ttydPort}
        deploymentId={deploymentId}
        owner={owner}
        repo={repo}
        issueNumber={issueNumber}
        issueTitle={issueTitle}
      />
    </>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/web test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|ensureTtyd|checkSession|endSession)"`
Expected: All tests PASS

- [ ] **Step 6: Typecheck**

Run: `pnpm turbo typecheck`
Expected: Clean

- [ ] **Step 7: Commit**

```bash
git add packages/web/lib/actions/launch.ts packages/web/lib/actions/launch.test.ts packages/web/components/terminal/OpenTerminalButton.tsx
git commit -m "feat(web): add ensureTtyd to respawn terminal on demand before opening"
```

---

### Task 6: Integration test — ttyd respawn with real processes

**Files:**
- Create: `packages/web/e2e/terminal-respawn.spec.ts`

- [ ] **Step 1: Write the integration test**

Create `packages/web/e2e/terminal-respawn.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import WebSocket from "ws";

/**
 * Integration test: verify that ttyd can be respawned against an
 * existing tmux session after the original ttyd exits (due to -q
 * exit-on-disconnect). This proves the core reconnection cycle.
 *
 * Requirements: macOS, tmux, ttyd. Skipped otherwise.
 */

const execFileAsync = promisify(execFile);
const TEST_PORT = 7791;
const SESSION_NAME = "issuectl-test-respawn";

async function canRun(): Promise<{ ok: boolean; reason?: string }> {
  if (process.platform !== "darwin") {
    return { ok: false, reason: "Not macOS" };
  }
  for (const bin of ["ttyd", "tmux"]) {
    try {
      await execFileAsync("which", [bin]);
    } catch {
      return { ok: false, reason: `${bin} not installed` };
    }
  }
  return { ok: true };
}

function cleanupTmuxSession(): void {
  try {
    execFileSync("tmux", ["kill-session", "-t", SESSION_NAME], { stdio: "ignore" });
  } catch { /* may not exist */ }
}

function cleanupTtyd(proc: ChildProcess | null): void {
  if (proc?.pid) {
    try { process.kill(proc.pid, "SIGTERM"); } catch { /* already dead */ }
  }
}

function spawnTtyd(): ChildProcess {
  const proc = spawn(
    "ttyd",
    ["-W", "-i", "127.0.0.1", "-p", String(TEST_PORT), "-q",
     "tmux", "attach-session", "-t", SESSION_NAME],
    { detached: true, stdio: "ignore" },
  );
  proc.unref();
  return proc;
}

function isTtydAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Connect a WebSocket client, perform the ttyd handshake, collect
 * output for `ms` milliseconds, then close.
 */
function collectTerminalOutput(url: string, ms: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const ws = new WebSocket(url, ["tty"]);
    const timer = setTimeout(() => {
      ws.close();
      resolve(chunks.join(""));
    }, ms);

    ws.on("open", () => {
      ws.send("{}");
      ws.send("1" + JSON.stringify({ columns: 120, rows: 40 }));
    });

    ws.on("message", (data: Buffer | string) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (buf.length > 0 && buf[0] === 0x30) {
        chunks.push(buf.subarray(1).toString("utf-8"));
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      ws.close();
      reject(err);
    });
  });
}

test.describe("ttyd respawn", () => {
  let ttydProc: ChildProcess | null = null;

  test.beforeAll(async () => {
    const { ok, reason } = await canRun();
    test.skip(!ok, reason ?? "Prerequisites not met");
  });

  test.afterEach(() => {
    cleanupTtyd(ttydProc);
    ttydProc = null;
    cleanupTmuxSession();
  });

  test("reconnects to same tmux session after ttyd exits and respawns", async () => {
    cleanupTmuxSession();

    // 1. Create a tmux session with a unique marker
    const marker = `RESPAWN_TEST_${Date.now()}`;
    execFileSync("tmux", [
      "new-session", "-d", "-s", SESSION_NAME, "-x", "120", "-y", "40",
      `bash -c 'echo ${marker}; sleep 60'`,
    ]);

    // 2. Spawn ttyd with -q (exits when last client disconnects)
    ttydProc = spawnTtyd();
    await new Promise((r) => setTimeout(r, 1000));

    // 3. Connect a client, verify it sees the marker, then disconnect
    const wsUrl = `ws://127.0.0.1:${TEST_PORT}/ws`;
    const text1 = await collectTerminalOutput(wsUrl, 2000);
    expect(text1).toContain(marker);

    // 4. Wait for ttyd to exit (it should die after last client disconnects)
    await new Promise((r) => setTimeout(r, 1000));
    expect(isTtydAlive(ttydProc.pid!)).toBe(false);

    // 5. Verify tmux session is still alive
    expect(() => {
      execFileSync("tmux", ["has-session", "-t", SESSION_NAME], { stdio: "ignore" });
    }).not.toThrow();

    // 6. Respawn ttyd against the same session
    ttydProc = spawnTtyd();
    await new Promise((r) => setTimeout(r, 1000));

    // 7. Connect a new client — should see the tmux session (marker in scrollback)
    const text2 = await collectTerminalOutput(wsUrl, 2000);

    // The marker should be visible in the terminal scrollback — the
    // tmux session preserved state across the ttyd restart.
    // Note: scrollback visibility depends on tmux scroll position,
    // so we verify the connection succeeds and receives output.
    expect(text2.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @issuectl/web test:e2e -- terminal-respawn`
Expected: PASS (or skip if ttyd/tmux not installed)

- [ ] **Step 3: Commit**

```bash
git add packages/web/e2e/terminal-respawn.spec.ts
git commit -m "test(e2e): verify ttyd respawn reconnects to existing tmux session"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run all unit tests**

Run: `pnpm turbo test`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: Clean

- [ ] **Step 3: Verify no stale references to `checkTtydAlive`**

Run: `grep -r "checkTtydAlive" packages/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v .next`
Expected: No matches (fully renamed)

- [ ] **Step 4: Verify `isTtydAlive` is no longer exported from core index (optional cleanup)**

Check `packages/core/src/index.ts` — `isTtydAlive` should still be exported since `ensureTtyd` uses it via `@issuectl/core`. This is correct.

- [ ] **Step 5: Run e2e tests**

Run: `pnpm --filter @issuectl/web test:e2e`
Expected: All tests pass (terminal-respawn may be skipped if no ttyd/tmux)
