# ttyd Embedded Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the terminal app launcher system with ttyd-based embedded terminals in the issuectl dashboard.

**Architecture:** ttyd child processes serve Claude Code over HTTP+WebSocket on dynamic ports (7700–7799). The dashboard embeds terminals via iframe in a full-viewport slide-out panel. Process lifecycle (spawn, monitor, kill) is managed by a new core module. Orphaned processes are reconciled on server startup.

**Tech Stack:** ttyd (Homebrew binary), better-sqlite3 (schema migration), Next.js App Router (Server Components + Server Actions + Client Components), CSS Modules.

---

## File Map

### Files to create

| File | Responsibility |
|---|---|
| `packages/core/src/launch/ttyd.ts` | ttyd process manager: verify, spawn, kill, health check, port allocation |
| `packages/core/src/launch/ttyd.test.ts` | Unit tests for ttyd module |
| `packages/web/components/terminal/TerminalPanel.tsx` | Full-viewport slide-out panel with iframe |
| `packages/web/components/terminal/TerminalPanel.module.css` | Slide animation, handle, header, iframe layout |
| `packages/web/components/terminal/OpenTerminalButton.tsx` | Button to open the terminal panel |

### Files to modify

| File | Change |
|---|---|
| `packages/core/src/db/migrations.ts` | Add v11 migration (ttyd_port, ttyd_pid columns) |
| `packages/core/src/db/deployments.ts` | Map new columns in rowToDeployment, add updateTtydInfo |
| `packages/core/src/types.ts` | Add ttydPort/ttydPid to Deployment, remove terminal SettingKeys |
| `packages/core/src/db/settings.ts` | Remove terminal_app/window_title/tab_title_pattern defaults |
| `packages/core/src/launch/launch.ts` | Replace terminal launcher with ttyd spawn, update LaunchResult |
| `packages/core/src/index.ts` | Remove terminal exports, add ttyd exports |
| `packages/core/src/db/connection.ts` | Call reconcileOrphanedDeployments after migrations |
| `packages/web/lib/actions/launch.ts` | Import and call killTtyd in endSession |
| `packages/web/lib/actions/settings.ts` | Remove terminal setting keys from VALID_KEYS |
| `packages/web/components/settings/SettingsForm.tsx` | Remove Terminal section |
| `packages/web/components/launch/LaunchActiveBanner.tsx` | Add ttydPort prop, render OpenTerminalButton |
| `packages/web/components/launch/EndSessionButton.tsx` | No code change (endSession action handles kill) |
| `packages/web/components/detail/LaunchCard.tsx` | Pass ttydPort to LaunchActiveBanner |
| `packages/web/components/detail/IssueDetailContent.tsx` | Pass issueTitle to LaunchCard |

### Files to delete

| File | Reason |
|---|---|
| `packages/core/src/launch/terminal.ts` | Replaced by ttyd.ts |
| `packages/core/src/launch/terminal.test.ts` | Tests for deleted interface |
| `packages/core/src/launch/terminals/ghostty.ts` | Replaced by ttyd |
| `packages/core/src/launch/terminals/ghostty.test.ts` | Tests for deleted module |
| `packages/core/src/launch/terminals/ghostty.integration.test.ts` | Tests for deleted module |
| `packages/core/src/launch/terminals/iterm2.ts` | Replaced by ttyd |
| `packages/core/src/launch/terminals/macos-terminal.ts` | Replaced by ttyd |

---

## Milestone 1: Core ttyd module + DB migration

**Test checkpoint:** `pnpm turbo typecheck && pnpm --filter @issuectl/core test` passes. New ttyd functions are tested. Migration runs on existing DB.

---

### Task 1: DB migration v11 — add ttyd columns

**Files:**
- Modify: `packages/core/src/db/migrations.ts:232` (add migration after v10)
- Modify: `packages/core/src/types.ts:30-48` (add fields to Deployment)
- Modify: `packages/core/src/db/deployments.ts:4-15,17-29` (map new columns)

- [ ] **Step 1: Add migration v11 to migrations.ts**

Add after the v10 migration entry (before the closing `];`):

```typescript
  {
    version: 11,
    up(db) {
      db.exec(`
        ALTER TABLE deployments ADD COLUMN ttyd_port INTEGER;
        ALTER TABLE deployments ADD COLUMN ttyd_pid INTEGER;
      `);
    },
  },
```

- [ ] **Step 2: Update Deployment type in types.ts**

Add two fields to the `Deployment` type after `endedAt`:

```typescript
  ttydPort: number | null;
  ttydPid: number | null;
```

- [ ] **Step 3: Update DeploymentRow and rowToDeployment in deployments.ts**

Add to `DeploymentRow` type:

```typescript
  ttyd_port: number | null;
  ttyd_pid: number | null;
```

Add to the `rowToDeployment` function's return object:

```typescript
    ttydPort: row.ttyd_port,
    ttydPid: row.ttyd_pid,
```

- [ ] **Step 4: Add updateTtydInfo function to deployments.ts**

Add after the `activateDeployment` function:

```typescript
export function updateTtydInfo(
  db: Database.Database,
  deploymentId: number,
  port: number,
  pid: number,
): void {
  const result = db
    .prepare("UPDATE deployments SET ttyd_port = ?, ttyd_pid = ? WHERE id = ?")
    .run(port, pid, deploymentId);
  if (result.changes === 0) {
    throw new Error(`No deployment found with id ${deploymentId} to update ttyd info`);
  }
}
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS (some files that import terminal.ts may fail — that's fine, we delete those in Task 3)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/db/migrations.ts packages/core/src/types.ts packages/core/src/db/deployments.ts
git commit -m "feat: add ttyd_port and ttyd_pid columns to deployments (migration v11)"
```

---

### Task 2: ttyd process manager module

**Files:**
- Create: `packages/core/src/launch/ttyd.ts`
- Create: `packages/core/src/launch/ttyd.test.ts`

- [ ] **Step 1: Write failing tests for verifyTtyd**

Create `packages/core/src/launch/ttyd.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyTtyd, killTtyd, isTtydAlive } from "./ttyd.js";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));

import { execFileSync } from "node:child_process";
const mockExecFileSync = vi.mocked(execFileSync);

describe("verifyTtyd", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves when ttyd is found", async () => {
    mockExecFileSync.mockReturnValue(Buffer.from("/opt/homebrew/bin/ttyd\n"));
    await expect(verifyTtyd()).resolves.toBeUndefined();
    expect(mockExecFileSync).toHaveBeenCalledWith("which", ["ttyd"]);
  });

  it("throws when ttyd is not found", async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("not found");
    });
    await expect(verifyTtyd()).rejects.toThrow("ttyd is not installed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @issuectl/core test -- --run ttyd.test`
Expected: FAIL — `Cannot find module './ttyd.js'`

- [ ] **Step 3: Write verifyTtyd, killTtyd, isTtydAlive implementations**

Create `packages/core/src/launch/ttyd.ts`:

```typescript
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import type Database from "better-sqlite3";

const PORT_MIN = 7700;
const PORT_MAX = 7799;

export async function verifyTtyd(): Promise<void> {
  try {
    execFileSync("which", ["ttyd"]);
  } catch {
    throw new Error(
      "ttyd is not installed. Run: brew install ttyd",
    );
  }
}

export function killTtyd(pid: number): void {
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") {
      throw err;
    }
  }
}

export function isTtydAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/core test -- --run ttyd.test`
Expected: PASS

- [ ] **Step 5: Add failing tests for allocatePort**

Append to `ttyd.test.ts`:

```typescript
import type Database from "better-sqlite3";
import net from "node:net";
import { allocatePort } from "./ttyd.js";

describe("allocatePort", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns PORT_MIN when no ports are in use", async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      }),
    } as unknown as Database.Database;

    vi.spyOn(net, "connect").mockImplementation((...args: unknown[]) => {
      const socket = new net.Socket();
      process.nextTick(() => socket.destroy(new Error("ECONNREFUSED")));
      return socket;
    });

    await expect(allocatePort(db)).resolves.toBe(7700);
  });

  it("skips ports used by active deployments", async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([{ ttyd_port: 7700 }, { ttyd_port: 7701 }]),
      }),
    } as unknown as Database.Database;

    vi.spyOn(net, "connect").mockImplementation((...args: unknown[]) => {
      const socket = new net.Socket();
      process.nextTick(() => socket.destroy(new Error("ECONNREFUSED")));
      return socket;
    });

    await expect(allocatePort(db)).resolves.toBe(7702);
  });
});
```

- [ ] **Step 6: Write allocatePort implementation**

Add to `ttyd.ts`:

```typescript
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.setTimeout(200);
    socket.on("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(true);
    });
  });
}

export async function allocatePort(db: Database.Database): Promise<number> {
  const rows = db
    .prepare(
      "SELECT ttyd_port FROM deployments WHERE ended_at IS NULL AND ttyd_port IS NOT NULL",
    )
    .all() as { ttyd_port: number }[];
  const usedPorts = new Set(rows.map((r) => r.ttyd_port));

  for (let port = PORT_MIN; port <= PORT_MAX; port++) {
    if (usedPorts.has(port)) continue;
    if (await isPortFree(port)) return port;
  }

  throw new Error(
    `No free ports in range ${PORT_MIN}–${PORT_MAX}. End some sessions first.`,
  );
}
```

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @issuectl/core test -- --run ttyd.test`
Expected: PASS

- [ ] **Step 8: Add failing test for spawnTtyd**

Append to `ttyd.test.ts`:

```typescript
import { spawnTtyd, type SpawnTtydOptions } from "./ttyd.js";
import { spawn as nodeSpawn } from "node:child_process";

describe("spawnTtyd", () => {
  beforeEach(() => vi.clearAllMocks());

  it("spawns ttyd with correct arguments", () => {
    const mockedSpawn = vi.mocked(nodeSpawn);
    const fakeProcess = {
      pid: 12345,
      unref: vi.fn(),
      on: vi.fn(),
    };
    mockedSpawn.mockReturnValue(fakeProcess as unknown as ChildProcess);

    const result = spawnTtyd({
      port: 7700,
      workspacePath: "/tmp/workspace",
      contextFilePath: "/tmp/context.md",
      claudeCommand: "claude --model sonnet",
    });

    expect(result.pid).toBe(12345);
    expect(result.port).toBe(7700);
    expect(mockedSpawn).toHaveBeenCalledWith(
      "ttyd",
      expect.arrayContaining(["-W", "-p", "7700", "-q"]),
      expect.objectContaining({ detached: true }),
    );
    expect(fakeProcess.unref).toHaveBeenCalled();
  });
});
```

- [ ] **Step 9: Write spawnTtyd implementation**

Add to `ttyd.ts`:

```typescript
export type SpawnTtydOptions = {
  port: number;
  workspacePath: string;
  contextFilePath: string;
  claudeCommand: string;
};

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function spawnTtyd(options: SpawnTtydOptions): { pid: number; port: number } {
  const shellCommand =
    `cd ${shellEscape(options.workspacePath)} && cat ${shellEscape(options.contextFilePath)} | ${options.claudeCommand} ; exit`;

  const child = spawn("ttyd", ["-W", "-p", String(options.port), "-q", "/bin/bash", "-lic", shellCommand], {
    detached: true,
    stdio: "ignore",
  });

  if (!child.pid) {
    throw new Error("Failed to spawn ttyd process — no PID returned");
  }

  child.unref();

  return { pid: child.pid, port: options.port };
}
```

- [ ] **Step 10: Run all ttyd tests**

Run: `pnpm --filter @issuectl/core test -- --run ttyd.test`
Expected: PASS

- [ ] **Step 11: Add reconcileOrphanedDeployments**

Add to `ttyd.ts`:

```typescript
export function reconcileOrphanedDeployments(db: Database.Database): void {
  const rows = db
    .prepare(
      "SELECT id, ttyd_pid FROM deployments WHERE ended_at IS NULL AND ttyd_pid IS NOT NULL",
    )
    .all() as { id: number; ttyd_pid: number }[];

  for (const row of rows) {
    if (!isTtydAlive(row.ttyd_pid)) {
      db.prepare("UPDATE deployments SET ended_at = datetime('now') WHERE id = ?").run(row.id);
      console.warn(
        `[issuectl] Reconciled orphaned deployment ${row.id} (pid ${row.ttyd_pid} is dead)`,
      );
    }
  }
}
```

- [ ] **Step 12: Run full core test suite**

Run: `pnpm --filter @issuectl/core test`
Expected: PASS (terminal.test.ts and ghostty tests may fail — deleted in Task 3)

- [ ] **Step 13: Commit**

```bash
git add packages/core/src/launch/ttyd.ts packages/core/src/launch/ttyd.test.ts
git commit -m "feat: add ttyd process manager — spawn, kill, port allocation, reconciliation"
```

---

### Task 3: Remove terminal launcher system

**Files:**
- Delete: `packages/core/src/launch/terminal.ts`
- Delete: `packages/core/src/launch/terminal.test.ts`
- Delete: `packages/core/src/launch/terminals/ghostty.ts`
- Delete: `packages/core/src/launch/terminals/ghostty.test.ts`
- Delete: `packages/core/src/launch/terminals/ghostty.integration.test.ts`
- Delete: `packages/core/src/launch/terminals/iterm2.ts`
- Delete: `packages/core/src/launch/terminals/macos-terminal.ts`
- Modify: `packages/core/src/types.ts:10-18` (remove terminal SettingKeys)
- Modify: `packages/core/src/db/settings.ts:4-11` (remove terminal defaults)
- Modify: `packages/core/src/index.ts:170-176` (remove terminal exports)

- [ ] **Step 1: Delete terminal files**

```bash
rm packages/core/src/launch/terminal.ts
rm packages/core/src/launch/terminal.test.ts
rm packages/core/src/launch/terminals/ghostty.ts
rm packages/core/src/launch/terminals/ghostty.test.ts
rm packages/core/src/launch/terminals/ghostty.integration.test.ts
rm packages/core/src/launch/terminals/iterm2.ts
rm packages/core/src/launch/terminals/macos-terminal.ts
rmdir packages/core/src/launch/terminals
```

- [ ] **Step 2: Remove terminal SettingKeys from types.ts**

Remove these three entries from the `SettingKey` union type:

```typescript
  | "terminal_app"
  | "terminal_window_title"
  | "terminal_tab_title_pattern"
```

The remaining keys are: `"branch_pattern" | "cache_ttl" | "worktree_dir" | "claude_extra_args" | "default_repo_id"`.

- [ ] **Step 3: Remove terminal defaults from settings.ts**

Remove these three entries from the `DEFAULT_SETTINGS` array:

```typescript
  { key: "terminal_app", value: "iterm2" },
  { key: "terminal_window_title", value: "issuectl" },
  { key: "terminal_tab_title_pattern", value: "#{number} — {title}" },
```

- [ ] **Step 4: Remove terminal exports from index.ts**

Remove the terminal export block:

```typescript
export {
  getTerminalLauncher,
  type TerminalLauncher,
  type TerminalLaunchOptions,
  type TerminalSettings,
  type SupportedTerminal,
} from "./launch/terminal.js";
```

Add ttyd exports in its place:

```typescript
export {
  verifyTtyd,
  spawnTtyd,
  killTtyd,
  isTtydAlive,
  allocatePort,
  reconcileOrphanedDeployments,
  type SpawnTtydOptions,
} from "./launch/ttyd.js";
export { updateTtydInfo } from "./db/deployments.js";
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: Errors in `launch.ts` (still imports terminal), `SettingsForm.tsx`, `settings.ts` action — these are fixed in later tasks. The core types should be clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove Ghostty/iTerm2/Terminal.app launcher system"
```

---

### Task 4: Rewire executeLaunch to use ttyd

**Files:**
- Modify: `packages/core/src/launch/launch.ts`

- [ ] **Step 1: Update imports in launch.ts**

Replace the terminal import:

```typescript
import { getTerminalLauncher, type SupportedTerminal } from "./terminal.js";
```

With:

```typescript
import { verifyTtyd, spawnTtyd, allocatePort } from "./ttyd.js";
import { updateTtydInfo } from "../db/deployments.js";
```

- [ ] **Step 2: Update LaunchResult type**

Add `ttydPort` field:

```typescript
export interface LaunchResult {
  deploymentId: number;
  branchName: string;
  workspacePath: string;
  contextFilePath: string;
  ttydPort: number;
  labelWarning?: string;
}
```

- [ ] **Step 3: Replace terminal verification in executeLaunch (step 0)**

Replace lines 67–73 (terminal settings + launcher + verify):

```typescript
  // 0. Build terminal launcher and verify
  const terminalSettings = {
    terminal: (getSetting(db, "terminal_app") ?? "ghostty") as SupportedTerminal,
    windowTitle: getSetting(db, "terminal_window_title") ?? "issuectl",
    tabTitlePattern: getSetting(db, "terminal_tab_title_pattern") ?? "#{number} — {title}",
  };
  const launcher = getTerminalLauncher(terminalSettings);
  await launcher.verify();
```

With:

```typescript
  // 0. Verify ttyd is installed
  await verifyTtyd();
```

- [ ] **Step 4: Replace terminal launch (step 9) with ttyd spawn**

Replace the terminal launch block (from `const claudeCommand` through the catch block and activation) with:

```typescript
  // 9. Spawn ttyd
  const claudeCommand = buildClaudeCommand(getSetting(db, "claude_extra_args"));
  console.warn(`[issuectl] launching: ${claudeCommand}`);
  let ttydPort: number;
  try {
    const port = await allocatePort(db);
    const { pid } = spawnTtyd({
      port,
      workspacePath: workspace.path,
      contextFilePath,
      claudeCommand,
    });
    updateTtydInfo(db, deployment.id, port, pid);
    ttydPort = port;
  } catch (err) {
    try {
      deletePendingDeployment(db, deployment.id);
    } catch (rollbackErr) {
      console.error(
        "[issuectl] Failed to roll back pending deployment after ttyd spawn failure",
        { deploymentId: deployment.id },
        rollbackErr,
      );
    }
    throw err;
  }

  // 9b. Flip pending -> active.
  activateDeployment(db, deployment.id);

  // 10. Return result
  return {
    deploymentId: deployment.id,
    branchName: options.branchName,
    workspacePath: workspace.path,
    contextFilePath,
    ttydPort,
    ...(labelWarning ? { labelWarning } : {}),
  };
```

- [ ] **Step 5: Update launch.test.ts**

The existing launch tests mock the terminal launcher. Update them to mock `verifyTtyd`, `allocatePort`, `spawnTtyd`, and `updateTtydInfo` instead. Read the existing test file, find the terminal-related mocks, and replace them. The test should verify that `spawnTtyd` is called with the correct workspace path and claude command.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @issuectl/core test`
Expected: PASS

- [ ] **Step 7: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: Errors only in web package (settings form, settings action) — fixed in Milestone 2

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/launch/launch.ts packages/core/src/launch/launch.test.ts
git commit -m "feat: replace terminal launcher with ttyd spawn in executeLaunch"
```

---

### Task 5: Add orphan reconciliation to DB startup

**Files:**
- Modify: `packages/core/src/db/connection.ts:24-35`

- [ ] **Step 1: Add reconciliation import and call**

Add import at top of `connection.ts`:

```typescript
import { reconcileOrphanedDeployments } from "../launch/ttyd.js";
```

Add reconciliation call in `getDb()` after `runMigrations(db)`:

```typescript
  runMigrations(db);
  reconcileOrphanedDeployments(db);
```

- [ ] **Step 2: Run core tests**

Run: `pnpm --filter @issuectl/core test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/db/connection.ts
git commit -m "feat: reconcile orphaned ttyd deployments on DB startup"
```

---

**Milestone 1 checkpoint:** Stop and test.

Run: `pnpm turbo typecheck && pnpm --filter @issuectl/core test`

Core package should be fully clean. Web package will have type errors from the removed terminal settings — that's expected and fixed in Milestone 2.

---

## Milestone 2: Web — settings cleanup + endSession kill

**Test checkpoint:** `pnpm turbo typecheck` passes across all packages. Settings page works without terminal section.

---

### Task 6: Clean up settings UI and server action

**Files:**
- Modify: `packages/web/lib/actions/settings.ts:7-16`
- Modify: `packages/web/components/settings/SettingsForm.tsx`
- Modify: `packages/web/app/settings/page.tsx`

- [ ] **Step 1: Remove terminal keys from settings server action**

In `packages/web/lib/actions/settings.ts`, remove these three entries from `VALID_KEYS`:

```typescript
  "terminal_app",
  "terminal_window_title",
  "terminal_tab_title_pattern",
```

- [ ] **Step 2: Remove terminal section from SettingsForm**

In `packages/web/components/settings/SettingsForm.tsx`:

Remove from `Props` type:
```typescript
  terminalApp: string;
  windowTitle: string;
  tabTitlePattern: string;
```

Remove from `FormValues` type:
```typescript
  terminal_window_title: string;
  terminal_tab_title_pattern: string;
```

Remove from `useState` initial values:
```typescript
    terminal_window_title: windowTitle,
    terminal_tab_title_pattern: tabTitlePattern,
```

Remove from `originals`:
```typescript
    terminal_window_title: windowTitle,
    terminal_tab_title_pattern: tabTitlePattern,
```

Delete the entire Terminal `<section>` block (the section containing Application, Window Title, and Tab Title Pattern fields — approximately lines 171–219).

Update the component's Props destructuring to remove `terminalApp`, `windowTitle`, `tabTitlePattern`.

- [ ] **Step 3: Update settings page to stop passing terminal props**

In `packages/web/app/settings/page.tsx`, find where `SettingsForm` is rendered and remove the `terminalApp`, `windowTitle`, and `tabTitlePattern` props. Read the file first to find exact lines.

- [ ] **Step 4: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/lib/actions/settings.ts packages/web/components/settings/SettingsForm.tsx packages/web/app/settings/page.tsx
git commit -m "refactor: remove terminal settings from settings UI and server action"
```

---

### Task 7: Update endSession to kill ttyd

**Files:**
- Modify: `packages/web/lib/actions/launch.ts:125-143`

- [ ] **Step 1: Update endSession server action**

In `packages/web/lib/actions/launch.ts`, update the imports to add `getDeploymentById` and `killTtyd`:

```typescript
import {
  getDb,
  getRepo,
  getDeploymentById,
  executeLaunch,
  endDeployment as coreEndDeployment,
  killTtyd,
  withAuthRetry,
  withIdempotency,
  DuplicateInFlightError,
  formatErrorForUser,
  type WorkspaceMode,
} from "@issuectl/core";
```

Update the `endSession` function body to kill ttyd before ending:

```typescript
export async function endSession(
  deploymentId: number,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  try {
    const db = getDb();
    const deployment = getDeploymentById(db, deploymentId);
    if (deployment?.ttydPid) {
      killTtyd(deployment.ttydPid);
    }
    coreEndDeployment(db, deploymentId);
  } catch (err) {
    console.error("[issuectl] Failed to end session:", err);
    return { success: false, error: formatErrorForUser(err) };
  }
  const { stale } = revalidateSafely(
    `/${owner}/${repo}/issues/${issueNumber}`,
    `/${owner}/${repo}/issues/${issueNumber}/launch`,
  );
  return { success: true, ...(stale ? { cacheStale: true } : {}) };
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/lib/actions/launch.ts
git commit -m "feat: kill ttyd process when ending session"
```

---

**Milestone 2 checkpoint:** Stop and test.

Run: `pnpm turbo typecheck`

All packages should pass. Start the dev server (`pnpm turbo dev`) and verify the Settings page loads without the Terminal section. Verify launching an issue spawns a ttyd process (check `ps aux | grep ttyd`). Verify ending a session kills it.

---

## Milestone 3: Dashboard UI — terminal panel

**Test checkpoint:** Full-viewport slide-out panel opens from the issue detail page. Terminal iframe loads ttyd. "End Session" kills the process and closes the panel.

---

### Task 8: TerminalPanel slide-out component

**Files:**
- Create: `packages/web/components/terminal/TerminalPanel.tsx`
- Create: `packages/web/components/terminal/TerminalPanel.module.css`

- [ ] **Step 1: Create TerminalPanel.module.css**

Create `packages/web/components/terminal/TerminalPanel.module.css`:

```css
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  pointer-events: none;
}

.overlay[data-open="true"] {
  pointer-events: auto;
}

.panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  background: var(--paper-bg);
  box-shadow: var(--paper-shadow-drawer);
  transform: translateX(100%);
  transition: transform 0.3s ease;
  z-index: 1001;
  display: flex;
  flex-direction: column;
}

.panel[data-open="true"] {
  transform: translateX(0);
}

.handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--paper-ink-muted);
  background: linear-gradient(90deg, var(--paper-bg-warm) 0%, transparent 100%);
  transition: color 0.15s ease, background 0.15s ease;
  z-index: 1;
  user-select: none;
}

.handle:hover {
  color: var(--paper-ink);
  background: linear-gradient(90deg, var(--paper-bg-warmer) 0%, transparent 100%);
}

.handleChevron {
  font-size: 16px;
  font-weight: 700;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px 10px 40px;
  border-bottom: 1px solid var(--paper-line);
  flex-shrink: 0;
}

.headerTitle {
  flex: 1;
  font-family: var(--paper-mono);
  font-size: var(--paper-fs-sm);
  color: var(--paper-ink-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminalFrame {
  flex: 1;
  border: none;
  width: 100%;
  background: #1a1b26;
}
```

- [ ] **Step 2: Create TerminalPanel.tsx**

Create `packages/web/components/terminal/TerminalPanel.tsx`:

```tsx
"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/paper";
import { endSession } from "@/lib/actions/launch";
import styles from "./TerminalPanel.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  ttydPort: number;
  deploymentId: number;
  owner: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
};

export function TerminalPanel({
  open,
  onClose,
  ttydPort,
  deploymentId,
  owner,
  repo,
  issueNumber,
  issueTitle,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleEndSession = useCallback(() => {
    startTransition(async () => {
      const result = await endSession(deploymentId, owner, repo, issueNumber);
      if (result.success) {
        onClose();
        router.refresh();
      }
    });
  }, [deploymentId, owner, repo, issueNumber, onClose, router]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <div className={styles.overlay} data-open={open}>
      <div className={styles.panel} data-open={open}>
        <div className={styles.handle} onClick={onClose} title="Close terminal">
          <span className={styles.handleChevron}>{"\u203A"}</span>
        </div>
        <div className={styles.header}>
          <span className={styles.headerTitle}>
            #{issueNumber} — {issueTitle}
          </span>
          <Button
            variant="ghost"
            onClick={handleEndSession}
            disabled={isPending}
          >
            {isPending ? "Ending..." : "End Session"}
          </Button>
        </div>
        {open && (
          <iframe
            className={styles.terminalFrame}
            src={`http://localhost:${ttydPort}`}
            title={`Terminal — Issue #${issueNumber}`}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/terminal/TerminalPanel.tsx packages/web/components/terminal/TerminalPanel.module.css
git commit -m "feat: add full-viewport TerminalPanel slide-out component"
```

---

### Task 9: OpenTerminalButton and wire into LaunchActiveBanner

**Files:**
- Create: `packages/web/components/terminal/OpenTerminalButton.tsx`
- Modify: `packages/web/components/launch/LaunchActiveBanner.tsx`
- Modify: `packages/web/components/detail/LaunchCard.tsx`
- Modify: `packages/web/components/detail/IssueDetailContent.tsx`

- [ ] **Step 1: Create OpenTerminalButton**

Create `packages/web/components/terminal/OpenTerminalButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/paper";
import { TerminalPanel } from "./TerminalPanel";

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

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open Terminal
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

- [ ] **Step 2: Update LaunchActiveBanner to accept ttyd props**

Replace the full content of `packages/web/components/launch/LaunchActiveBanner.tsx`:

```tsx
import { EndSessionButton } from "./EndSessionButton";
import { OpenTerminalButton } from "@/components/terminal/OpenTerminalButton";
import styles from "./LaunchActiveBanner.module.css";

type Props = {
  deploymentId: number;
  branchName: string;
  endedAt: string | null;
  owner: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  ttydPort: number | null;
};

export function LaunchActiveBanner({
  deploymentId,
  branchName,
  endedAt,
  owner,
  repo,
  issueNumber,
  issueTitle,
  ttydPort,
}: Props) {
  if (endedAt) {
    return (
      <div className={styles.bannerEnded}>
        <div className={styles.checkmark}>{"\u2713"}</div>
        <div className={styles.text}>
          <div className={styles.titleEnded}>Session ended</div>
          <div className={styles.sub}>
            branch: {branchName}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.banner}>
      <div className={styles.spinner} />
      <div className={styles.text}>
        <div className={styles.title}>Claude Code session active</div>
        <div className={styles.sub}>
          branch: {branchName}
        </div>
      </div>
      {ttydPort && (
        <OpenTerminalButton
          ttydPort={ttydPort}
          deploymentId={deploymentId}
          owner={owner}
          repo={repo}
          issueNumber={issueNumber}
          issueTitle={issueTitle}
        />
      )}
      <EndSessionButton
        deploymentId={deploymentId}
        owner={owner}
        repo={repo}
        issueNumber={issueNumber}
      />
    </div>
  );
}
```

- [ ] **Step 3: Update LaunchCard to pass new props**

Replace the full content of `packages/web/components/detail/LaunchCard.tsx`:

```tsx
import type { Deployment } from "@issuectl/core";
import { LaunchActiveBanner } from "@/components/launch/LaunchActiveBanner";

type Props = {
  owner: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  deployments: Deployment[];
};

export function LaunchCard({ owner, repo, issueNumber, issueTitle, deployments }: Props) {
  const liveDeployment = deployments.find((d) => d.endedAt === null);
  if (!liveDeployment) return null;

  return (
    <LaunchActiveBanner
      deploymentId={liveDeployment.id}
      branchName={liveDeployment.branchName}
      endedAt={liveDeployment.endedAt}
      owner={owner}
      repo={repo}
      issueNumber={issueNumber}
      issueTitle={issueTitle}
      ttydPort={liveDeployment.ttydPort}
    />
  );
}
```

- [ ] **Step 4: Update IssueDetailContent to pass issueTitle to LaunchCard**

In `packages/web/components/detail/IssueDetailContent.tsx`, add `issueTitle={issue.title}` to both LaunchCard renders (the error branch on line 43 and the success branch on line 58):

```tsx
        <LaunchCard
          owner={owner}
          repo={repoName}
          issueNumber={issue.number}
          issueTitle={issue.title}
          deployments={deployments}
        />
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web/components/terminal/OpenTerminalButton.tsx packages/web/components/launch/LaunchActiveBanner.tsx packages/web/components/detail/LaunchCard.tsx packages/web/components/detail/IssueDetailContent.tsx
git commit -m "feat: wire OpenTerminalButton into issue detail page via LaunchActiveBanner"
```

---

**Milestone 3 checkpoint:** Stop and test end-to-end.

1. Start dev server: `pnpm turbo dev`
2. Open dashboard: `http://localhost:3847`
3. Navigate to an issue and launch it
4. Verify `ps aux | grep ttyd` shows a ttyd process
5. On the issue detail page, verify "Open Terminal" button appears
6. Click "Open Terminal" — verify the slide-out panel opens with the terminal iframe
7. Verify you can type in the terminal and interact with Claude Code
8. Close the panel (click the left-edge handle or press Escape)
9. Reopen the panel — verify the session is still running
10. Click "End Session" — verify ttyd process dies (`ps aux | grep ttyd`) and the panel closes
11. Verify the banner now shows "Session ended"

---

## Milestone 4: Cleanup and test updates

**Test checkpoint:** `pnpm turbo typecheck` passes. E2E tests updated to account for removed terminal settings and new ttyd behavior.

---

### Task 10: Update E2E tests for removed terminal settings

**Files:**
- Modify: E2E test files that reference `terminal_app`, `terminal_window_title`, or `terminal_tab_title_pattern`

- [ ] **Step 1: Find and update affected E2E tests**

The grep found these E2E files referencing terminal settings:

- `packages/web/e2e/data-freshness.spec.ts`
- `packages/web/e2e/create-with-repo.spec.ts`
- `packages/web/e2e/action-sheets.spec.ts`
- `packages/web/e2e/pwa-offline.spec.ts`
- `packages/web/e2e/pull-to-refresh.spec.ts`
- `packages/web/e2e/quick-create.spec.ts`
- `packages/web/e2e/mobile-ux-patterns.spec.ts`
- `packages/web/e2e/launch-ui.spec.ts`
- `packages/web/e2e/launch-flow.spec.ts`
- `packages/web/e2e/audit-verification.spec.ts`
- `packages/web/lib/actions/settings.test.ts`

Read each file. For each one:
- Remove any assertions about terminal_app, terminal_window_title, or terminal_tab_title_pattern
- Remove any interactions with the Terminal section of the Settings form
- Update any test DB seeds that set terminal settings
- If a test file only tests terminal settings, delete the test

- [ ] **Step 2: Update settings.test.ts unit tests**

In `packages/web/lib/actions/settings.test.ts`, remove test cases for terminal setting keys. Update any batch-update tests that include terminal keys.

- [ ] **Step 3: Run E2E tests (if dev server is available)**

Run: `pnpm --filter @issuectl/web test:e2e`
Expected: PASS (or known failures unrelated to this change)

- [ ] **Step 4: Run full typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: update E2E and unit tests for terminal settings removal"
```

---

### Task 11: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Key technology table**

Replace:

```
| Terminal | Ghostty (hard-coded for v1) |
```

With:

```
| Terminal | ttyd (web-based, embedded in dashboard) |
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md to reflect ttyd terminal replacement"
```

---

**Final checkpoint:** Run the full quality gate.

```bash
pnpm turbo typecheck
pnpm --filter @issuectl/core test
```

All should pass. The feature is complete when:
- Launching an issue spawns a ttyd process
- The issue detail page shows "Open Terminal" for active deployments
- The slide-out panel opens full viewport with the terminal iframe
- "End Session" kills the ttyd process
- Server restart reconciles orphaned deployments
- Settings page no longer shows terminal app options
- All type checks pass
