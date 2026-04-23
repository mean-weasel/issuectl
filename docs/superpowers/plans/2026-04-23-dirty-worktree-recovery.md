# Dirty Worktree Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a worktree has uncommitted changes from a previous session, show a pre-flight warning banner in the launch modal with "Discard & Start Fresh" and "Resume with Changes" options instead of a hard error.

**Architecture:** Two new core functions (`checkWorktreeStatus`, `resetWorktree`) expose worktree state and cleanup. A `forceResume` flag threads through `LaunchOptions` → `prepareWorkspace` → `prepareWorktree` to skip the dirty check. The UI calls a pre-flight server action on modal open, then renders a `DirtyWorktreeBanner` component when a dirty worktree is detected.

**Tech Stack:** TypeScript, Vitest, Next.js Server Actions, CSS Modules, Paper design tokens

**Spec:** `docs/superpowers/specs/2026-04-23-dirty-worktree-recovery-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `packages/core/src/launch/worktree-status.ts` | `checkWorktreeStatus` and `resetWorktree` functions |
| Create | `packages/core/src/launch/worktree-status.test.ts` | Unit tests for the above |
| Modify | `packages/core/src/launch/workspace.ts:101-128` | Add `forceResume` option to `prepareWorktree` |
| Modify | `packages/core/src/launch/workspace.ts:52-69` | Thread `forceResume` through `prepareWorkspace` |
| Modify | `packages/core/src/launch/workspace.test.ts` | Add tests for `forceResume` flag |
| Modify | `packages/core/src/launch/launch.ts:23-32` | Add `forceResume` to `LaunchOptions` |
| Modify | `packages/core/src/launch/launch.ts:144-156` | Pass `forceResume` to `prepareWorkspace` |
| Modify | `packages/core/src/index.ts:157-178` | Export new functions |
| Create | `packages/web/lib/actions/worktree.ts` | Server actions: `checkWorktreeStatus`, `resetWorktree` |
| Modify | `packages/web/lib/actions/launch.ts:22-32` | Add `forceResume` to `LaunchFormData` |
| Modify | `packages/web/lib/actions/launch.ts:100-127` | Pass `forceResume` through to `executeLaunch` |
| Create | `packages/web/components/launch/DirtyWorktreeBanner.tsx` | Warning banner component |
| Create | `packages/web/components/launch/DirtyWorktreeBanner.module.css` | Banner styles (desktop + mobile) |
| Modify | `packages/web/components/launch/LaunchModal.tsx` | Integrate pre-flight check and banner |

---

### Task 1: Core — `checkWorktreeStatus` function + tests

**Files:**
- Create: `packages/core/src/launch/worktree-status.ts`
- Create: `packages/core/src/launch/worktree-status.test.ts`

- [ ] **Step 1: Write the test file with all test cases**

```typescript
// packages/core/src/launch/worktree-status.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { accessMock, execFileMock, rmMock, branchMocks } = vi.hoisted(() => {
  const accessMock = vi.fn();
  const execFileMock = vi.fn();
  const rmMock = vi.fn();
  const branchMocks = {
    isWorkingTreeClean: vi.fn(),
  };
  return { accessMock, execFileMock, rmMock, branchMocks };
});

vi.mock("node:fs/promises", () => ({
  access: accessMock,
  rm: rmMock,
}));

vi.mock("node:util", () => ({
  promisify: () => execFileMock,
}));

vi.mock("./branch.js", () => ({
  isWorkingTreeClean: branchMocks.isWorkingTreeClean,
}));

const { checkWorktreeStatus, resetWorktree } = await import("./worktree-status.js");

beforeEach(() => {
  accessMock.mockReset();
  execFileMock.mockReset();
  rmMock.mockReset().mockResolvedValue(undefined);
  branchMocks.isWorkingTreeClean.mockReset();
});

describe("checkWorktreeStatus", () => {
  it("returns exists: false when directory does not exist", async () => {
    accessMock.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const result = await checkWorktreeStatus("/worktrees", "myrepo", 42);
    expect(result).toEqual({ exists: false, dirty: false, path: "/worktrees/myrepo-issue-42" });
  });

  it("returns exists: true, dirty: false for a clean worktree", async () => {
    accessMock.mockResolvedValue(undefined);
    execFileMock.mockResolvedValue({ stdout: "", stderr: "" }); // git rev-parse succeeds
    branchMocks.isWorkingTreeClean.mockResolvedValue(true);

    const result = await checkWorktreeStatus("/worktrees", "myrepo", 42);
    expect(result).toEqual({ exists: true, dirty: false, path: "/worktrees/myrepo-issue-42" });
  });

  it("returns exists: true, dirty: true for a dirty worktree", async () => {
    accessMock.mockResolvedValue(undefined);
    execFileMock.mockResolvedValue({ stdout: "", stderr: "" }); // git rev-parse succeeds
    branchMocks.isWorkingTreeClean.mockResolvedValue(false);

    const result = await checkWorktreeStatus("/worktrees", "myrepo", 42);
    expect(result).toEqual({ exists: true, dirty: true, path: "/worktrees/myrepo-issue-42" });
  });

  it("returns exists: false when directory exists but is not a git repo", async () => {
    accessMock.mockResolvedValue(undefined);
    execFileMock.mockRejectedValue(new Error("not a git repository"));

    const result = await checkWorktreeStatus("/worktrees", "myrepo", 42);
    expect(result).toEqual({ exists: false, dirty: false, path: "/worktrees/myrepo-issue-42" });
  });
});

describe("resetWorktree", () => {
  it("removes the directory and prunes worktree references", async () => {
    execFileMock.mockResolvedValue({ stdout: "", stderr: "" });

    await resetWorktree("/worktrees/myrepo-issue-42", "/repos/myrepo");
    expect(rmMock).toHaveBeenCalledWith("/worktrees/myrepo-issue-42", { recursive: true, force: true });
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["worktree", "prune"],
      expect.objectContaining({ cwd: "/repos/myrepo" }),
    );
  });

  it("throws when rm fails", async () => {
    rmMock.mockRejectedValue(new Error("EPERM"));

    await expect(resetWorktree("/worktrees/myrepo-issue-42", "/repos/myrepo"))
      .rejects.toThrow("EPERM");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @issuectl/core test -- src/launch/worktree-status.test.ts`
Expected: FAIL — module `./worktree-status.js` not found

- [ ] **Step 3: Implement `checkWorktreeStatus` and `resetWorktree`**

```typescript
// packages/core/src/launch/worktree-status.ts
import { access, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { isWorkingTreeClean } from "./branch.js";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 5_000;

export interface WorktreeStatus {
  exists: boolean;
  dirty: boolean;
  path: string;
}

/**
 * Check if a worktree directory exists for this issue and whether it
 * has uncommitted changes.
 */
export async function checkWorktreeStatus(
  worktreeDir: string,
  repo: string,
  issueNumber: number,
): Promise<WorktreeStatus> {
  const worktreeName = `${repo}-issue-${issueNumber}`;
  const worktreePath = join(worktreeDir, worktreeName);

  // Does the directory exist?
  try {
    await access(worktreePath);
  } catch {
    return { exists: false, dirty: false, path: worktreePath };
  }

  // Is it a git repo?
  try {
    await execFileAsync("git", ["rev-parse", "--git-dir"], {
      cwd: worktreePath,
      timeout: GIT_TIMEOUT_MS,
    });
  } catch {
    // Directory exists but isn't a git repo — treat as non-existent
    return { exists: false, dirty: false, path: worktreePath };
  }

  // Is the working tree clean?
  const clean = await isWorkingTreeClean(worktreePath);
  return { exists: true, dirty: !clean, path: worktreePath };
}

/**
 * Remove a worktree directory and prune stale git worktree references.
 */
export async function resetWorktree(
  worktreePath: string,
  repoPath: string,
): Promise<void> {
  await rm(worktreePath, { recursive: true, force: true });
  await execFileAsync("git", ["worktree", "prune"], {
    cwd: repoPath,
    timeout: GIT_TIMEOUT_MS,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/core test -- src/launch/worktree-status.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/launch/worktree-status.ts packages/core/src/launch/worktree-status.test.ts
git commit -m "feat(core): add checkWorktreeStatus and resetWorktree functions"
```

---

### Task 2: Core — Thread `forceResume` through launch options

**Files:**
- Modify: `packages/core/src/launch/launch.ts:23-32, 144-156`
- Modify: `packages/core/src/launch/workspace.ts:52-69, 101-128`
- Modify: `packages/core/src/launch/workspace.test.ts`

- [ ] **Step 1: Add `forceResume` to `LaunchOptions`**

In `packages/core/src/launch/launch.ts`, add the optional field:

```typescript
// Add after line 31 (preamble?: string;)
  forceResume?: boolean;
```

- [ ] **Step 2: Pass `forceResume` to `prepareWorkspace`**

In `packages/core/src/launch/launch.ts`, update the `prepareWorkspace` call (around line 148):

```typescript
const workspace = await prepareWorkspace({
  mode: options.workspaceMode,
  repoPath: repoPath ?? "",
  owner: options.owner,
  repo: options.repo,
  branchName: options.branchName,
  issueNumber: options.issueNumber,
  worktreeDir,
  forceResume: options.forceResume,
});
```

- [ ] **Step 3: Thread `forceResume` through `prepareWorkspace` to `prepareWorktree`**

In `packages/core/src/launch/workspace.ts`, update the `prepareWorkspace` options type (line 52) to include `forceResume?: boolean`, and pass it to `prepareWorktree`:

```typescript
export async function prepareWorkspace(options: {
  mode: WorkspaceMode;
  repoPath: string;
  owner: string;
  repo: string;
  branchName: string;
  issueNumber: number;
  worktreeDir: string;
  forceResume?: boolean;
}): Promise<WorkspaceResult> {
  switch (options.mode) {
    case "existing":
      return prepareExisting(options.repoPath, options.branchName);
    case "worktree":
      return prepareWorktree(options);
    case "clone":
      return prepareClone(options);
  }
}
```

Update `prepareWorktree` to accept and use `forceResume` (around line 101):

```typescript
async function prepareWorktree(options: {
  repoPath: string;
  branchName: string;
  repo: string;
  issueNumber: number;
  worktreeDir: string;
  forceResume?: boolean;
}): Promise<WorkspaceResult> {
```

Then update the dirty-worktree check (around lines 119–128). Replace the block that throws with:

```typescript
    if (await isGitRepo(worktreePath)) {
      if (await isWorkingTreeClean(worktreePath)) {
        await createOrCheckoutBranch(worktreePath, options.branchName, defaultBranch);
        return { path: worktreePath, mode: "worktree", created: false };
      }
      if (options.forceResume) {
        // Resume with existing changes — skip the dirty check
        return { path: worktreePath, mode: "worktree", created: false };
      }
      throw new Error(
        `Worktree at ${worktreePath} has uncommitted changes from a previous launch of this issue. ` +
        `Commit or stash them (or remove the worktree with \`git worktree remove\`) before launching again.`,
      );
    }
```

Note: `isGitRepo` is the existing logic that runs `git rev-parse` in a try/catch. Look at the existing code around line 120 and preserve that pattern — it may be an inline try/catch rather than a named function.

- [ ] **Step 4: Write test for `forceResume` in workspace.test.ts**

Add to the existing `describe("prepareWorkspace — worktree mode")` block in `packages/core/src/launch/workspace.test.ts`:

```typescript
it("skips dirty-worktree error when forceResume is true", async () => {
  // Directory exists
  accessMock.mockResolvedValue(undefined);
  // Is a git repo
  execFileMock.mockResolvedValue({ stdout: "", stderr: "" });
  // Is dirty
  branchMocks.isWorkingTreeClean.mockResolvedValue(false);

  const result = await prepareWorkspace({
    ...BASE_OPTIONS,
    mode: "worktree",
    forceResume: true,
  });

  expect(result.path).toBe("/tmp/worktrees/myrepo-issue-1");
  expect(result.mode).toBe("worktree");
  expect(result.created).toBe(false);
});

it("still throws on dirty worktree when forceResume is not set", async () => {
  // Directory exists
  accessMock.mockResolvedValue(undefined);
  // Is a git repo
  execFileMock.mockResolvedValue({ stdout: "", stderr: "" });
  // Is dirty
  branchMocks.isWorkingTreeClean.mockResolvedValue(false);

  await expect(
    prepareWorkspace({ ...BASE_OPTIONS, mode: "worktree" }),
  ).rejects.toThrow("uncommitted changes");
});
```

- [ ] **Step 5: Run all tests**

Run: `pnpm --filter @issuectl/core test -- src/launch/workspace.test.ts`
Expected: All tests PASS (including new ones)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/launch/launch.ts packages/core/src/launch/workspace.ts packages/core/src/launch/workspace.test.ts
git commit -m "feat(core): thread forceResume through launch → prepareWorktree"
```

---

### Task 3: Core — Export new functions from index.ts

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add exports**

In `packages/core/src/index.ts`, add after the existing `export { prepareWorkspace } from "./launch/workspace.js";` line:

```typescript
export {
  checkWorktreeStatus,
  resetWorktree,
  type WorktreeStatus,
} from "./launch/worktree-status.js";
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export checkWorktreeStatus and resetWorktree"
```

---

### Task 4: Web — Server actions for worktree status and reset

**Files:**
- Create: `packages/web/lib/actions/worktree.ts`
- Modify: `packages/web/lib/actions/launch.ts:22-32, 100-127`

- [ ] **Step 1: Create worktree server actions**

```typescript
// packages/web/lib/actions/worktree.ts
"use server";

import {
  getDb,
  getRepo,
  getSetting,
  expandHome,
  checkWorktreeStatus as coreCheckWorktreeStatus,
  resetWorktree as coreResetWorktree,
  type WorktreeStatus,
} from "@issuectl/core";

export async function checkWorktreeStatus(
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<WorktreeStatus> {
  if (!owner || !repo || !Number.isInteger(issueNumber) || issueNumber <= 0) {
    return { exists: false, dirty: false, path: "" };
  }

  try {
    const db = getDb();
    const repoRecord = getRepo(db, owner, repo);
    if (!repoRecord) {
      return { exists: false, dirty: false, path: "" };
    }

    const worktreeDir = expandHome(
      getSetting(db, "worktree_dir") ?? "~/.issuectl/worktrees/",
    );

    return await coreCheckWorktreeStatus(worktreeDir, repo, issueNumber);
  } catch (err) {
    console.error("[issuectl] Worktree status check failed:", err);
    return { exists: false, dirty: false, path: "" };
  }
}

export async function resetWorktree(
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<{ success: boolean; error?: string }> {
  if (!owner || !repo || !Number.isInteger(issueNumber) || issueNumber <= 0) {
    return { success: false, error: "Invalid parameters" };
  }

  try {
    const db = getDb();
    const repoRecord = getRepo(db, owner, repo);
    if (!repoRecord) {
      return { success: false, error: "Repository not found" };
    }

    const repoLocalPath = repoRecord.localPath;
    if (!repoLocalPath) {
      return { success: false, error: "Repository has no local path" };
    }

    const worktreeDir = expandHome(
      getSetting(db, "worktree_dir") ?? "~/.issuectl/worktrees/",
    );
    const worktreeName = `${repo}-issue-${issueNumber}`;
    const worktreePath = `${worktreeDir}/${worktreeName}`;

    await coreResetWorktree(worktreePath, expandHome(repoLocalPath));
    return { success: true };
  } catch (err) {
    console.error("[issuectl] Worktree reset failed:", err);
    const message = err instanceof Error ? err.message : "Failed to reset worktree";
    return { success: false, error: message };
  }
}
```

- [ ] **Step 2: Check if `getSetting` and `expandHome` are exported from core**

Run: `grep -n "getSetting\|expandHome" packages/core/src/index.ts`

If not exported, add them. `getSetting` should be in the DB section; `expandHome` should be in a utils section. Adjust the imports in the server action accordingly.

- [ ] **Step 3: Add `forceResume` to `LaunchFormData` and thread it through**

In `packages/web/lib/actions/launch.ts`, add to the `LaunchFormData` type:

```typescript
  forceResume?: boolean;
```

Then in the `runLaunch` function inside `launchIssue` (around line 106), add `forceResume` to the options passed to `executeLaunch`:

```typescript
const r = await withAuthRetry((octokit) =>
  executeLaunch(db, octokit, {
    owner,
    repo,
    issueNumber,
    branchName: trimmedBranch,
    workspaceMode,
    selectedComments: formData.selectedCommentIndices,
    selectedFiles: formData.selectedFilePaths,
    preamble: formData.preamble || undefined,
    forceResume: formData.forceResume,
  }),
);
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass

- [ ] **Step 5: Commit**

```bash
git add packages/web/lib/actions/worktree.ts packages/web/lib/actions/launch.ts
git commit -m "feat(web): add worktree status/reset server actions, thread forceResume"
```

---

### Task 5: Web — DirtyWorktreeBanner component

**Files:**
- Create: `packages/web/components/launch/DirtyWorktreeBanner.tsx`
- Create: `packages/web/components/launch/DirtyWorktreeBanner.module.css`

- [ ] **Step 1: Create the CSS module**

```css
/* packages/web/components/launch/DirtyWorktreeBanner.module.css */
.banner {
  background: rgba(217, 165, 77, 0.1);
  border: 1px solid rgba(217, 165, 77, 0.35);
  border-radius: var(--paper-radius-md);
  padding: 12px;
  margin-bottom: 16px;
}

.header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
}

.icon {
  color: var(--paper-butter);
  font-size: 14px;
  line-height: 1.3;
  flex-shrink: 0;
}

.title {
  font-weight: 600;
  font-size: 12px;
  color: var(--paper-butter);
  margin-bottom: 2px;
}

.subtitle {
  font-size: 11px;
  color: var(--paper-ink-muted);
  line-height: 1.4;
}

.actions {
  display: flex;
  gap: 8px;
}

.discardBtn,
.resumeBtn {
  flex: 1;
  padding: 8px 12px;
  border: none;
  border-radius: var(--paper-radius-sm);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  min-height: 36px;
}

.discardBtn {
  background: var(--paper-brick);
  color: #fff;
}

.discardBtn:hover {
  opacity: 0.9;
}

.resumeBtn {
  background: var(--paper-accent);
  color: #fff;
}

.resumeBtn:hover {
  opacity: 0.9;
}

.discardBtn:disabled,
.resumeBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  margin-top: 8px;
  font-size: 11px;
  color: var(--paper-brick);
}

/* Mobile: stack buttons vertically, larger touch targets */
@media (max-width: 767px) {
  .actions {
    flex-direction: column;
  }

  .discardBtn,
  .resumeBtn {
    min-height: 44px;
  }
}
```

- [ ] **Step 2: Create the component**

```tsx
// packages/web/components/launch/DirtyWorktreeBanner.tsx
"use client";

import { useState, useTransition } from "react";
import { resetWorktree } from "@/lib/actions/worktree";
import styles from "./DirtyWorktreeBanner.module.css";

type Props = {
  owner: string;
  repo: string;
  issueNumber: number;
  worktreePath: string;
  onDiscard: () => void;
  onResume: () => void;
};

export function DirtyWorktreeBanner({
  owner,
  repo,
  issueNumber,
  worktreePath,
  onDiscard,
  onResume,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDiscard() {
    setError(null);
    startTransition(async () => {
      const result = await resetWorktree(owner, repo, issueNumber);
      if (result.success) {
        onDiscard();
      } else {
        setError(result.error ?? `Failed to clean worktree — try manually removing ${worktreePath}`);
      }
    });
  }

  return (
    <div className={styles.banner} role="alert">
      <div className={styles.header}>
        <span className={styles.icon} aria-hidden="true">&#9888;</span>
        <div>
          <div className={styles.title}>Previous session left uncommitted changes</div>
          <div className={styles.subtitle}>How would you like to proceed?</div>
        </div>
      </div>
      <div className={styles.actions}>
        <button
          className={styles.discardBtn}
          onClick={handleDiscard}
          disabled={isPending}
        >
          {isPending ? "Cleaning up…" : "Discard & Start Fresh"}
        </button>
        <button
          className={styles.resumeBtn}
          onClick={onResume}
          disabled={isPending}
        >
          Resume with Changes
        </button>
      </div>
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/launch/DirtyWorktreeBanner.tsx packages/web/components/launch/DirtyWorktreeBanner.module.css
git commit -m "feat(web): add DirtyWorktreeBanner component"
```

---

### Task 6: Web — Integrate banner into LaunchModal

**Files:**
- Modify: `packages/web/components/launch/LaunchModal.tsx`

- [ ] **Step 1: Add imports and state**

At the top of `LaunchModal.tsx`, add the imports:

```typescript
import { checkWorktreeStatus } from "@/lib/actions/worktree";
import { DirtyWorktreeBanner } from "./DirtyWorktreeBanner";
```

Inside the component, after the existing state declarations (around line 66), add:

```typescript
const [dirtyWorktree, setDirtyWorktree] = useState<{
  dirty: boolean;
  path: string;
} | null>(null);
const [forceResume, setForceResume] = useState(false);
```

- [ ] **Step 2: Add pre-flight check effect**

After the existing `useEffect` for comments (around line 78), add:

```typescript
useEffect(() => {
  if (workspaceMode !== "worktree" && workspaceMode !== "clone") {
    setDirtyWorktree(null);
    return;
  }

  let cancelled = false;
  checkWorktreeStatus(owner, repo, issue.number).then((status) => {
    if (cancelled) return;
    if (status.exists && status.dirty) {
      setDirtyWorktree({ dirty: true, path: status.path });
    } else {
      setDirtyWorktree(null);
    }
  });

  return () => { cancelled = true; };
}, [owner, repo, issue.number, workspaceMode]);
```

- [ ] **Step 3: Add banner to the JSX**

In the `return` JSX, after the `issueSummary` div and before `<BranchInput>` (around line 183), add:

```tsx
{dirtyWorktree?.dirty && !forceResume && (
  <DirtyWorktreeBanner
    owner={owner}
    repo={repo}
    issueNumber={issue.number}
    worktreePath={dirtyWorktree.path}
    onDiscard={() => setDirtyWorktree(null)}
    onResume={() => setForceResume(true)}
  />
)}
```

- [ ] **Step 4: Pass `forceResume` to `launchIssue`**

In the `handleLaunch` function, update the `launchIssue` call (around line 119) to include `forceResume`:

```typescript
const result = await launchIssue({
  owner,
  repo,
  issueNumber: issue.number,
  branchName: branchName.trim(),
  workspaceMode,
  selectedCommentIndices: selectedComments,
  selectedFilePaths: selectedFiles,
  preamble: preamble.trim() || undefined,
  idempotencyKey,
  forceResume,
});
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass

- [ ] **Step 6: Commit**

```bash
git add packages/web/components/launch/LaunchModal.tsx
git commit -m "feat(web): integrate dirty worktree pre-flight check and banner"
```

---

### Task 7: Build, typecheck, and manual verification

**Files:** None (verification only)

- [ ] **Step 1: Run full typecheck**

Run: `pnpm turbo typecheck`
Expected: All 3 packages pass

- [ ] **Step 2: Run full build**

Run: `pnpm turbo build`
Expected: All 3 packages build successfully (no lint errors in new/modified files)

- [ ] **Step 3: Run all core tests**

Run: `pnpm --filter @issuectl/core test`
Expected: All tests pass, including new `worktree-status.test.ts` and updated `workspace.test.ts`

- [ ] **Step 4: Verify in the browser**

1. Start dev server: `pnpm turbo dev`
2. Open `localhost:3847`
3. Navigate to an issue that has a worktree (or create a dirty worktree manually: `mkdir -p ~/.issuectl/worktrees/REPO-issue-N && cd ~/.issuectl/worktrees/REPO-issue-N && git init && touch dirty-file`)
4. Open the launch modal — verify the warning banner appears
5. Test "Resume with Changes" — banner disappears, launch proceeds
6. Test "Discard & Start Fresh" — banner disappears after cleanup, directory removed
7. Test with a clean worktree — no banner
8. Test on mobile viewport (393px) — buttons stack vertically, 44px touch targets

- [ ] **Step 5: Commit any fixes from verification**

If any issues found during manual testing, fix and commit.
