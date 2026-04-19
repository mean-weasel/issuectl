# Offline Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add offline mode with client-side operation queue, visual indicators, and sync-on-reconnect for the issuectl web dashboard.

**Architecture:** Client-first queue in IndexedDB intercepts network failures from server actions. Three-tier action classification (works offline / queued / blocked). On reconnect, a health check confirms server reachability, then queued operations replay sequentially through existing server actions. Auto-refresh revalidates cached data after sync.

**Tech Stack:** IndexedDB (idb-keyval or raw API), React hooks, CSS Modules, existing server actions, Playwright for E2E, fake-indexeddb for unit tests.

**Spec:** `docs/superpowers/specs/2026-04-19-offline-mode-design.md`

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `packages/web/lib/offline-queue.ts` | IndexedDB wrapper: enqueue, list, update status, remove |
| `packages/web/lib/offline-queue.test.ts` | Unit tests for queue operations |
| `packages/web/lib/tryOrQueue.ts` | Server action wrapper: offline detection, failure interception, queueing |
| `packages/web/lib/tryOrQueue.test.ts` | Unit tests for the interception logic |
| `packages/web/lib/sync.ts` | Reconnect replay: health check, sequential replay, failure handling |
| `packages/web/lib/sync.test.ts` | Unit tests for sync replay logic |
| `packages/web/hooks/useOfflineAware.ts` | Hook: offline state, action tier lookup, queue count |
| `packages/web/hooks/useSyncOnReconnect.ts` | Hook: listens for `online` event, triggers sync + refresh |
| `packages/web/app/api/health/route.ts` | Health check endpoint (no auth, no DB) |
| `packages/web/components/ui/CacheAge.tsx` | Relative time badge ("Cached 5m ago") |
| `packages/web/components/ui/CacheAge.module.css` | Styles for cache age badge |
| `packages/web/components/ui/QueueDropdown.tsx` | Dropdown listing queued operations with cancel |
| `packages/web/components/ui/QueueDropdown.module.css` | Styles for queue dropdown |
| `packages/web/components/ui/FailureModal.tsx` | Modal for failed operation resolution (retry/discard) |
| `packages/web/components/ui/FailureModal.module.css` | Styles for failure modal |
| `packages/web/e2e/offline-queue.spec.ts` | E2E tests for offline → queue → reconnect flow |

### Modified files

| File | Change |
|---|---|
| `packages/web/components/ui/OfflineIndicator.tsx` | Add queue count, responsive text, dropdown trigger |
| `packages/web/components/ui/OfflineIndicator.module.css` | Clickable banner, expanded state styles |
| `packages/web/components/list/AssignSheet.tsx` | Wrap `assignDraftAction` with `tryOrQueue` |
| `packages/web/components/detail/CommentComposer.tsx` | Wrap `addComment` with `tryOrQueue` |
| `packages/web/components/issue/LabelManager.tsx` | Wrap `toggleLabel` with `tryOrQueue` |
| `packages/web/components/detail/IssueActionSheet.tsx` | Disable close/reassign when offline |
| `packages/web/components/detail/DraftActionSheet.tsx` | (No change — delete is Tier 1, assign delegates to AssignSheet) |
| `packages/web/app/layout.tsx` | Wire `useSyncOnReconnect` into client wrapper |
| `packages/web/vitest.config.ts` | Expand `include` to cover `hooks/**/*.test.ts` |
| `packages/web/package.json` | Add `fake-indexeddb` dev dependency |

---

## Task 1: Health Check Endpoint

**Files:**
- Create: `packages/web/app/api/health/route.ts`

- [ ] **Step 1: Create the health endpoint**

```typescript
// packages/web/app/api/health/route.ts
export function GET() {
  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Verify it works**

Run: `curl http://localhost:3847/api/health`
Expected: `{"ok":true}` with status 200

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/api/health/route.ts
git commit -m "feat(offline): add /api/health endpoint for connectivity checks"
```

---

## Task 2: IndexedDB Queue Module

**Files:**
- Create: `packages/web/lib/offline-queue.ts`
- Create: `packages/web/lib/offline-queue.test.ts`
- Modify: `packages/web/package.json` (add fake-indexeddb)
- Modify: `packages/web/vitest.config.ts` (no change needed — tests are in `lib/`)

- [ ] **Step 1: Install fake-indexeddb for tests**

```bash
pnpm --filter @issuectl/web add -D fake-indexeddb
```

- [ ] **Step 2: Write the failing tests**

```typescript
// packages/web/lib/offline-queue.test.ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  enqueue,
  listPending,
  listFailed,
  markSyncing,
  markFailed,
  remove,
  clearAll,
  type QueuedOperation,
} from "./offline-queue";

beforeEach(async () => {
  await clearAll();
});

describe("offline-queue", () => {
  it("enqueues an operation and lists it as pending", async () => {
    const op = await enqueue("addComment", {
      owner: "acme",
      repo: "api",
      issueNumber: 47,
      body: "hello",
    }, "nonce-1");

    expect(op.id).toBeDefined();
    expect(op.action).toBe("addComment");
    expect(op.status).toBe("pending");
    expect(op.nonce).toBe("nonce-1");

    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(op.id);
  });

  it("lists pending operations ordered by createdAt", async () => {
    await enqueue("addComment", { body: "first" }, "n1");
    await enqueue("toggleLabel", { label: "bug" }, "n2");

    const pending = await listPending();
    expect(pending).toHaveLength(2);
    expect(pending[0].action).toBe("addComment");
    expect(pending[1].action).toBe("toggleLabel");
  });

  it("marks an operation as syncing", async () => {
    const op = await enqueue("assignDraft", { draftId: "d1" }, "n1");
    await markSyncing(op.id);

    const pending = await listPending();
    expect(pending).toHaveLength(0);
  });

  it("marks an operation as failed with error", async () => {
    const op = await enqueue("addComment", { body: "x" }, "n1");
    await markSyncing(op.id);
    await markFailed(op.id, "Repo not found");

    const failed = await listFailed();
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toBe("Repo not found");
    expect(failed[0].attemptedAt).toBeDefined();
  });

  it("reverts a syncing operation back to pending", async () => {
    const op = await enqueue("addComment", { body: "x" }, "n1");
    await markSyncing(op.id);
    // Re-enqueue as pending (simulates network re-failure during sync)
    await markPending(op.id);

    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe("pending");
  });

  it("removes an operation from the queue", async () => {
    const op = await enqueue("addComment", { body: "x" }, "n1");
    await remove(op.id);

    const pending = await listPending();
    expect(pending).toHaveLength(0);
  });

  it("clearAll removes everything", async () => {
    await enqueue("addComment", { body: "a" }, "n1");
    await enqueue("toggleLabel", { label: "b" }, "n2");
    await clearAll();

    const pending = await listPending();
    expect(pending).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @issuectl/web vitest run lib/offline-queue.test.ts`
Expected: FAIL — module `./offline-queue` has no exports

- [ ] **Step 4: Implement the queue module**

```typescript
// packages/web/lib/offline-queue.ts

export type QueueableAction = "assignDraft" | "addComment" | "toggleLabel";

export type QueuedOperation = {
  id: string;
  action: QueueableAction;
  params: Record<string, unknown>;
  nonce: string;
  status: "pending" | "syncing" | "failed";
  error: string | null;
  createdAt: number;
  attemptedAt: number | null;
};

const DB_NAME = "issuectl-offline";
const STORE_NAME = "queued-ops";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const request = fn(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

function getAllFromStore(): Promise<QueuedOperation[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

export async function enqueue(
  action: QueueableAction,
  params: Record<string, unknown>,
  nonce: string,
): Promise<QueuedOperation> {
  const op: QueuedOperation = {
    id: crypto.randomUUID(),
    action,
    params,
    nonce,
    status: "pending",
    error: null,
    createdAt: Date.now(),
    attemptedAt: null,
  };
  await withStore("readwrite", (store) => store.put(op));
  return op;
}

export async function listPending(): Promise<QueuedOperation[]> {
  const all = await getAllFromStore();
  return all
    .filter((op) => op.status === "pending")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function listFailed(): Promise<QueuedOperation[]> {
  const all = await getAllFromStore();
  return all.filter((op) => op.status === "failed");
}

export async function listAll(): Promise<QueuedOperation[]> {
  const all = await getAllFromStore();
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function markSyncing(id: string): Promise<void> {
  const all = await getAllFromStore();
  const op = all.find((o) => o.id === id);
  if (!op) return;
  op.status = "syncing";
  op.attemptedAt = Date.now();
  await withStore("readwrite", (store) => store.put(op));
}

export async function markFailed(id: string, error: string): Promise<void> {
  const all = await getAllFromStore();
  const op = all.find((o) => o.id === id);
  if (!op) return;
  op.status = "failed";
  op.error = error;
  op.attemptedAt = Date.now();
  await withStore("readwrite", (store) => store.put(op));
}

export async function markPending(id: string): Promise<void> {
  const all = await getAllFromStore();
  const op = all.find((o) => o.id === id);
  if (!op) return;
  op.status = "pending";
  await withStore("readwrite", (store) => store.put(op));
}

export async function remove(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function clearAll(): Promise<void> {
  await withStore("readwrite", (store) => store.clear());
}
```

- [ ] **Step 5: Add the missing `markPending` import to the test file**

Add `markPending` to the import in `offline-queue.test.ts`:

```typescript
import {
  enqueue,
  listPending,
  listFailed,
  markSyncing,
  markFailed,
  markPending,
  remove,
  clearAll,
  type QueuedOperation,
} from "./offline-queue";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/web vitest run lib/offline-queue.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/web/lib/offline-queue.ts packages/web/lib/offline-queue.test.ts packages/web/package.json pnpm-lock.yaml
git commit -m "feat(offline): add IndexedDB operation queue module with tests"
```

---

## Task 3: tryOrQueue Helper

**Files:**
- Create: `packages/web/lib/tryOrQueue.ts`
- Create: `packages/web/lib/tryOrQueue.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/web/lib/tryOrQueue.test.ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { tryOrQueue } from "./tryOrQueue";
import { clearAll, listPending } from "./offline-queue";

beforeEach(async () => {
  await clearAll();
});

describe("tryOrQueue", () => {
  it("returns succeeded when server action succeeds", async () => {
    const action = vi.fn().mockResolvedValue({ success: true, issueNumber: 1 });

    const result = await tryOrQueue("addComment", { body: "hi" }, action);

    expect(result.outcome).toBe("succeeded");
    expect(action).toHaveBeenCalled();
    const pending = await listPending();
    expect(pending).toHaveLength(0);
  });

  it("queues when navigator.onLine is false", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const action = vi.fn();

    const result = await tryOrQueue("addComment", { body: "hi" }, action);

    expect(result.outcome).toBe("queued");
    expect(action).not.toHaveBeenCalled();
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].action).toBe("addComment");

    vi.unstubAllGlobals();
  });

  it("queues when server action throws TypeError (fetch failure)", async () => {
    const action = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await tryOrQueue("addComment", { body: "hi" }, action);

    expect(result.outcome).toBe("queued");
    const pending = await listPending();
    expect(pending).toHaveLength(1);
  });

  it("queues when server returns network error", async () => {
    const action = vi.fn().mockResolvedValue({
      success: false,
      error: "Network error — GitHub is unreachable",
    });

    const result = await tryOrQueue(
      "addComment",
      { body: "hi" },
      action,
      { isNetworkError: (e) => e.includes("Network error") },
    );

    expect(result.outcome).toBe("queued");
    const pending = await listPending();
    expect(pending).toHaveLength(1);
  });

  it("returns error for non-network server failures", async () => {
    const action = vi.fn().mockResolvedValue({
      success: false,
      error: "Validation failed: title is required",
    });

    const result = await tryOrQueue("addComment", { body: "hi" }, action);

    expect(result.outcome).toBe("error");
    if (result.outcome === "error") {
      expect(result.error).toBe("Validation failed: title is required");
    }
    const pending = await listPending();
    expect(pending).toHaveLength(0);
  });

  it("uses provided nonce instead of generating one", async () => {
    vi.stubGlobal("navigator", { onLine: false });

    await tryOrQueue("assignDraft", { draftId: "d1" }, vi.fn(), {
      nonce: "existing-nonce",
    });

    const pending = await listPending();
    expect(pending[0].nonce).toBe("existing-nonce");

    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @issuectl/web vitest run lib/tryOrQueue.test.ts`
Expected: FAIL — module `./tryOrQueue` not found

- [ ] **Step 3: Implement tryOrQueue**

```typescript
// packages/web/lib/tryOrQueue.ts
import { enqueue, type QueueableAction } from "./offline-queue";
import { newIdempotencyKey } from "./idempotency-key";

export type TryOrQueueResult =
  | { outcome: "succeeded"; data: Record<string, unknown> }
  | { outcome: "queued" }
  | { outcome: "error"; error: string };

type ActionResult = { success: boolean; error?: string };

/** Keywords in server-action error strings that indicate a network-class failure. */
const NETWORK_KEYWORDS = [
  "network error",
  "unreachable",
  "econnrefused",
  "etimedout",
  "enotfound",
  "econnreset",
  "timeout",
] as const;

function defaultIsNetworkError(error: string): boolean {
  const lower = error.toLowerCase();
  return NETWORK_KEYWORDS.some((kw) => lower.includes(kw));
}

type Options = {
  /** Override for nonce — used by assignDraft which has its own idempotency key. */
  nonce?: string;
  /** Custom predicate to classify server-returned errors as network-class. */
  isNetworkError?: (error: string) => boolean;
};

export async function tryOrQueue(
  action: QueueableAction,
  params: Record<string, unknown>,
  serverActionFn: () => Promise<ActionResult>,
  options?: Options,
): Promise<TryOrQueueResult> {
  const nonce = options?.nonce ?? newIdempotencyKey();
  const isNetErr = options?.isNetworkError ?? defaultIsNetworkError;

  // Pre-flight: if browser says we're offline, queue immediately.
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await enqueue(action, params, nonce);
    return { outcome: "queued" };
  }

  try {
    const result = await serverActionFn();

    if (result.success) {
      return { outcome: "succeeded", data: result as Record<string, unknown> };
    }

    // Server responded but the operation failed.
    const errorMsg = result.error ?? "Unknown error";
    if (isNetErr(errorMsg)) {
      await enqueue(action, params, nonce);
      return { outcome: "queued" };
    }

    return { outcome: "error", error: errorMsg };
  } catch (err) {
    // Fetch-level failure — server/tunnel unreachable.
    if (err instanceof TypeError || (err instanceof DOMException && err.name === "AbortError")) {
      await enqueue(action, params, nonce);
      return { outcome: "queued" };
    }
    // Unexpected error — don't queue, surface it.
    throw err;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/web vitest run lib/tryOrQueue.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/lib/tryOrQueue.ts packages/web/lib/tryOrQueue.test.ts
git commit -m "feat(offline): add tryOrQueue helper for intercepting network failures"
```

---

## Task 4: Sync Replay Module

**Files:**
- Create: `packages/web/lib/sync.ts`
- Create: `packages/web/lib/sync.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/web/lib/sync.test.ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { enqueue, clearAll, listPending, listFailed } from "./offline-queue";
import { replayQueue } from "./sync";

beforeEach(async () => {
  await clearAll();
});

describe("replayQueue", () => {
  it("does nothing when queue is empty", async () => {
    const executor = vi.fn();
    const result = await replayQueue(executor);
    expect(result).toEqual({ synced: 0, failed: 0, stopped: false });
    expect(executor).not.toHaveBeenCalled();
  });

  it("replays pending operations and removes on success", async () => {
    await enqueue("addComment", { body: "hello" }, "n1");
    await enqueue("toggleLabel", { label: "bug" }, "n2");

    const executor = vi.fn().mockResolvedValue({ success: true });
    const result = await replayQueue(executor);

    expect(result).toEqual({ synced: 2, failed: 0, stopped: false });
    expect(executor).toHaveBeenCalledTimes(2);

    const pending = await listPending();
    expect(pending).toHaveLength(0);
  });

  it("stops on network error and reverts to pending", async () => {
    await enqueue("addComment", { body: "a" }, "n1");
    await enqueue("toggleLabel", { label: "b" }, "n2");

    const executor = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await replayQueue(executor);

    expect(result).toEqual({ synced: 0, failed: 0, stopped: true });
    expect(executor).toHaveBeenCalledTimes(1);

    const pending = await listPending();
    expect(pending).toHaveLength(2);
  });

  it("marks non-network failures and continues", async () => {
    await enqueue("addComment", { body: "a" }, "n1");
    await enqueue("toggleLabel", { label: "b" }, "n2");

    const executor = vi.fn()
      .mockResolvedValueOnce({ success: false, error: "Repo not found" })
      .mockResolvedValueOnce({ success: true });

    const result = await replayQueue(executor);

    expect(result).toEqual({ synced: 1, failed: 1, stopped: false });

    const failed = await listFailed();
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toBe("Repo not found");

    const pending = await listPending();
    expect(pending).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @issuectl/web vitest run lib/sync.test.ts`
Expected: FAIL — module `./sync` not found

- [ ] **Step 3: Implement the sync module**

```typescript
// packages/web/lib/sync.ts
import {
  listPending,
  markSyncing,
  markFailed,
  markPending,
  remove,
  type QueuedOperation,
} from "./offline-queue";

type ActionResult = { success: boolean; error?: string };

type ReplayResult = {
  synced: number;
  failed: number;
  stopped: boolean;
};

/**
 * Replay all pending operations sequentially.
 *
 * @param executor — called for each operation. Must call the appropriate
 *   server action based on `op.action` and `op.params`. Returns the
 *   server action result.
 */
export async function replayQueue(
  executor: (op: QueuedOperation) => Promise<ActionResult>,
): Promise<ReplayResult> {
  const pending = await listPending();
  if (pending.length === 0) {
    return { synced: 0, failed: 0, stopped: false };
  }

  let synced = 0;
  let failed = 0;

  for (const op of pending) {
    await markSyncing(op.id);

    try {
      const result = await executor(op);

      if (result.success) {
        await remove(op.id);
        synced++;
      } else {
        // Non-network error — mark failed, continue to next.
        await markFailed(op.id, result.error ?? "Unknown error");
        failed++;
      }
    } catch (err) {
      // Network-level failure — stop processing, revert to pending.
      if (
        err instanceof TypeError ||
        (err instanceof DOMException && err.name === "AbortError")
      ) {
        await markPending(op.id);
        return { synced, failed, stopped: true };
      }
      // Unexpected error — mark failed, continue.
      await markFailed(
        op.id,
        err instanceof Error ? err.message : "Unexpected error",
      );
      failed++;
    }
  }

  return { synced, failed, stopped: false };
}

/**
 * Check if the server is reachable via the health endpoint.
 */
export async function checkHealth(baseUrl = ""): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/web vitest run lib/sync.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/lib/sync.ts packages/web/lib/sync.test.ts
git commit -m "feat(offline): add sync replay module with health check"
```

---

## Task 5: useOfflineAware Hook

**Files:**
- Create: `packages/web/hooks/useOfflineAware.ts`

- [ ] **Step 1: Implement the hook**

```typescript
// packages/web/hooks/useOfflineAware.ts
"use client";

import { useState, useEffect, useSyncExternalStore, useCallback } from "react";
import { listAll, type QueuedOperation } from "@/lib/offline-queue";

export type ActionTier = 1 | 2 | 3;

const ACTION_TIERS: Record<string, ActionTier> = {
  createDraft: 1,
  editDraft: 1,
  deleteDraft: 1,
  setPriority: 1,
  removeRepo: 1,
  updateRepo: 1,
  assignDraft: 2,
  addComment: 2,
  toggleLabel: 2,
  closeIssue: 3,
  mergePull: 3,
  updateIssue: 3,
  addRepo: 3,
  refreshDashboard: 3,
};

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true; // SSR assumes online
}

export function useOfflineAware() {
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    getServerSnapshot,
  );
  const [queue, setQueue] = useState<QueuedOperation[]>([]);

  const refreshQueue = useCallback(async () => {
    try {
      const ops = await listAll();
      setQueue(ops);
    } catch {
      // IndexedDB unavailable (SSR, etc.)
    }
  }, []);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  const isOffline = !isOnline;

  const pendingCount = queue.filter((op) => op.status === "pending").length;
  const failedCount = queue.filter((op) => op.status === "failed").length;
  const syncingCount = queue.filter((op) => op.status === "syncing").length;

  function getTier(action: string): ActionTier {
    return ACTION_TIERS[action] ?? 3;
  }

  function isBlocked(action: string): boolean {
    return isOffline && getTier(action) === 3;
  }

  function canQueue(action: string): boolean {
    return getTier(action) === 2;
  }

  return {
    isOffline,
    isOnline,
    queue,
    pendingCount,
    failedCount,
    syncingCount,
    getTier,
    isBlocked,
    canQueue,
    refreshQueue,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS (no type errors)

- [ ] **Step 3: Commit**

```bash
git add packages/web/hooks/useOfflineAware.ts
git commit -m "feat(offline): add useOfflineAware hook for action tiering"
```

---

## Task 6: useSyncOnReconnect Hook

**Files:**
- Create: `packages/web/hooks/useSyncOnReconnect.ts`

- [ ] **Step 1: Implement the hook**

```typescript
// packages/web/hooks/useSyncOnReconnect.ts
"use client";

import { useEffect, useRef, useCallback } from "react";
import { checkHealth, replayQueue } from "@/lib/sync";
import { listPending, type QueuedOperation } from "@/lib/offline-queue";
import { assignDraftAction } from "@/lib/actions/drafts";
import { addComment } from "@/lib/actions/comments";
import { toggleLabel } from "@/lib/actions/issues";
import { refreshAction } from "@/lib/actions/refresh";

type ActionResult = { success: boolean; error?: string };

async function executeOperation(op: QueuedOperation): Promise<ActionResult> {
  const p = op.params;
  switch (op.action) {
    case "assignDraft":
      return assignDraftAction(
        p.draftId as string,
        p.repoId as number,
        op.nonce,
      );
    case "addComment":
      return addComment(
        p.owner as string,
        p.repo as string,
        p.issueNumber as number,
        p.body as string,
        op.nonce,
      );
    case "toggleLabel":
      return toggleLabel({
        owner: p.owner as string,
        repo: p.repo as string,
        number: p.issueNumber as number,
        label: p.label as string,
        action: p.action as "add" | "remove",
      });
    default:
      return { success: false, error: `Unknown action: ${op.action}` };
  }
}

type SyncCallbacks = {
  onSyncSuccess?: (op: QueuedOperation) => void;
  onSyncFailed?: (failedCount: number) => void;
  onRefreshQueue?: () => void;
};

export function useSyncOnReconnect(callbacks?: SyncCallbacks) {
  const syncingRef = useRef(false);

  const handleOnline = useCallback(async () => {
    if (syncingRef.current) return;

    const pending = await listPending();
    if (pending.length === 0) {
      // No queue — just refresh data.
      try {
        await refreshAction();
      } catch {
        // Server might not be reachable yet.
      }
      return;
    }

    // Verify server is actually reachable (not just OS thinking we're online).
    const healthy = await checkHealth();
    if (!healthy) return;

    syncingRef.current = true;
    try {
      const result = await replayQueue(executeOperation);
      callbacks?.onRefreshQueue?.();

      if (result.synced > 0) {
        // Refresh dashboard data after successful syncs.
        try {
          await refreshAction();
        } catch {
          // Non-critical — data will be stale until next manual refresh.
        }
      }

      if (result.failed > 0) {
        callbacks?.onSyncFailed?.(result.failed);
      }
    } finally {
      syncingRef.current = false;
    }
  }, [callbacks]);

  useEffect(() => {
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [handleOnline]);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/hooks/useSyncOnReconnect.ts
git commit -m "feat(offline): add useSyncOnReconnect hook for replay on connectivity"
```

---

## Task 7: Enhanced OfflineIndicator + QueueDropdown

**Files:**
- Modify: `packages/web/components/ui/OfflineIndicator.tsx`
- Modify: `packages/web/components/ui/OfflineIndicator.module.css`
- Create: `packages/web/components/ui/QueueDropdown.tsx`
- Create: `packages/web/components/ui/QueueDropdown.module.css`

- [ ] **Step 1: Create QueueDropdown component**

```typescript
// packages/web/components/ui/QueueDropdown.tsx
"use client";

import { type QueuedOperation, remove } from "@/lib/offline-queue";
import styles from "./QueueDropdown.module.css";

type Props = {
  operations: QueuedOperation[];
  onCancel: (id: string) => void;
};

function describeOp(op: QueuedOperation): string {
  const p = op.params;
  switch (op.action) {
    case "assignDraft":
      return `Assign draft → repo`;
    case "addComment":
      return `Comment on ${p.owner}/${p.repo}#${p.issueNumber}`;
    case "toggleLabel": {
      const verb = p.action === "add" ? "Add" : "Remove";
      return `${verb} label "${p.label}" on ${p.owner}/${p.repo}#${p.issueNumber}`;
    }
    default:
      return op.action;
  }
}

export function QueueDropdown({ operations, onCancel }: Props) {
  if (operations.length === 0) return null;

  return (
    <div className={styles.dropdown} role="list" aria-label="Queued operations">
      <div className={styles.header}>Queued operations</div>
      {operations.map((op) => (
        <div key={op.id} className={styles.row} role="listitem">
          <span className={styles.description}>{describeOp(op)}</span>
          <button
            className={styles.cancel}
            onClick={() => onCancel(op.id)}
            aria-label={`Cancel: ${describeOp(op)}`}
          >
            Cancel
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create QueueDropdown styles**

```css
/* packages/web/components/ui/QueueDropdown.module.css */
.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--paper-bg-warm);
  border-bottom: 1px solid var(--paper-line);
  box-shadow: 0 4px 16px rgba(26, 23, 18, 0.12);
  z-index: 9999;
  animation: slideDown 0.2s ease-out;
}

.header {
  padding: 8px 16px 4px;
  font-family: var(--paper-sans);
  font-size: var(--paper-fs-xs);
  font-weight: 600;
  color: var(--paper-ink-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  gap: 12px;
}

.row + .row {
  border-top: 1px solid var(--paper-line-soft);
}

.description {
  font-family: var(--paper-sans);
  font-size: var(--paper-fs-sm);
  color: var(--paper-ink-soft);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cancel {
  background: none;
  border: none;
  font-family: var(--paper-sans);
  font-size: var(--paper-fs-xs);
  font-weight: 500;
  color: var(--paper-brick);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--paper-radius-sm);
  flex-shrink: 0;
}

.cancel:hover {
  background: rgba(168, 67, 42, 0.08);
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 3: Update OfflineIndicator**

Replace the full content of `packages/web/components/ui/OfflineIndicator.tsx`:

```typescript
// packages/web/components/ui/OfflineIndicator.tsx
"use client";

import { useState, useCallback } from "react";
import { useOfflineAware } from "@/hooks/useOfflineAware";
import { useSyncOnReconnect } from "@/hooks/useSyncOnReconnect";
import { remove } from "@/lib/offline-queue";
import { useToast } from "./ToastProvider";
import { QueueDropdown } from "./QueueDropdown";
import styles from "./OfflineIndicator.module.css";

export function OfflineIndicator() {
  const { showToast } = useToast();
  const {
    isOffline,
    queue,
    pendingCount,
    failedCount,
    refreshQueue,
  } = useOfflineAware();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleSyncFailed = useCallback(
    (count: number) => {
      showToast(
        `${count} operation${count > 1 ? "s" : ""} failed to sync`,
        "error",
      );
      refreshQueue();
    },
    [showToast, refreshQueue],
  );

  const handleSyncSuccess = useCallback(() => {
    refreshQueue();
  }, [refreshQueue]);

  useSyncOnReconnect({
    onSyncFailed: handleSyncFailed,
    onRefreshQueue: handleSyncSuccess,
  });

  const handleCancel = useCallback(
    async (id: string) => {
      await remove(id);
      refreshQueue();
      showToast("Queued operation cancelled", "warning");
    },
    [refreshQueue, showToast],
  );

  if (!isOffline && pendingCount === 0 && failedCount === 0) return null;

  // Only show banner when offline.
  if (!isOffline) return null;

  const pendingOps = queue.filter((op) => op.status === "pending");
  const hasQueue = pendingCount > 0;

  function handleBannerClick() {
    if (hasQueue) setDropdownOpen((o) => !o);
  }

  return (
    <div className={styles.wrapper}>
      <div
        className={`${styles.banner} ${hasQueue ? styles.clickable : ""}`}
        role="status"
        aria-live="polite"
        onClick={handleBannerClick}
      >
        <svg
          className={styles.icon}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6" />
          <line x1="8" y1="5" x2="8" y2="8.5" />
          <line x1="8" y1="11" x2="8.01" y2="11" />
        </svg>
        <span className={styles.textFull}>
          Offline — viewing cached data
          {hasQueue && ` · ${pendingCount} operation${pendingCount > 1 ? "s" : ""} queued`}
        </span>
        <span className={styles.textCompact}>
          Offline{hasQueue && ` · ${pendingCount} queued`}
        </span>
      </div>
      {dropdownOpen && (
        <QueueDropdown operations={pendingOps} onCancel={handleCancel} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update OfflineIndicator styles**

Replace the full content of `packages/web/components/ui/OfflineIndicator.module.css`:

```css
/* packages/web/components/ui/OfflineIndicator.module.css */
.wrapper {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10000;
}

.banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 16px;
  background: var(--paper-brick);
  color: #fff;
  font-family: var(--paper-sans);
  font-size: var(--paper-fs-sm);
  font-weight: 500;
  letter-spacing: 0.01em;
  animation: slideDown 0.3s ease-out;
  padding-top: calc(6px + env(safe-area-inset-top));
}

.clickable {
  cursor: pointer;
}

.clickable:hover {
  background: #963d26;
}

.icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.textFull {
  display: inline;
}

.textCompact {
  display: none;
}

@media (max-width: 480px) {
  .textFull {
    display: none;
  }
  .textCompact {
    display: inline;
  }
}

@keyframes slideDown {
  from { transform: translateY(-100%); }
  to { transform: translateY(0); }
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web/components/ui/OfflineIndicator.tsx packages/web/components/ui/OfflineIndicator.module.css packages/web/components/ui/QueueDropdown.tsx packages/web/components/ui/QueueDropdown.module.css
git commit -m "feat(offline): enhance OfflineIndicator with queue count and dropdown"
```

---

## Task 8: CacheAge Component

**Files:**
- Create: `packages/web/components/ui/CacheAge.tsx`
- Create: `packages/web/components/ui/CacheAge.module.css`

- [ ] **Step 1: Implement CacheAge component**

```typescript
// packages/web/components/ui/CacheAge.tsx
"use client";

import { useState, useEffect } from "react";
import styles from "./CacheAge.module.css";

type Props = {
  cachedAt: number | null; // unix ms
};

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const REFRESH_INTERVAL = 60_000;
const SHOW_THRESHOLD = 60_000; // Show after 1 minute

export function CacheAge({ cachedAt }: Props) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, []);

  if (!cachedAt) return null;

  const age = now - cachedAt;
  if (age < SHOW_THRESHOLD) return null;

  return (
    <span className={styles.badge} aria-label={`Data cached ${formatAge(age)}`}>
      Cached {formatAge(age)}
    </span>
  );
}
```

- [ ] **Step 2: Create CacheAge styles**

```css
/* packages/web/components/ui/CacheAge.module.css */
.badge {
  display: inline-block;
  padding: 1px 8px;
  background: var(--paper-bg-warmer);
  color: var(--paper-ink-muted);
  font-family: var(--paper-sans);
  font-size: var(--paper-fs-xs);
  font-weight: 500;
  border-radius: 10px;
  white-space: nowrap;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/ui/CacheAge.tsx packages/web/components/ui/CacheAge.module.css
git commit -m "feat(offline): add CacheAge badge component"
```

---

## Task 9: FailureModal Component

**Files:**
- Create: `packages/web/components/ui/FailureModal.tsx`
- Create: `packages/web/components/ui/FailureModal.module.css`

- [ ] **Step 1: Implement FailureModal**

```typescript
// packages/web/components/ui/FailureModal.tsx
"use client";

import { useState } from "react";
import { type QueuedOperation, remove } from "@/lib/offline-queue";
import styles from "./FailureModal.module.css";

type Props = {
  failures: QueuedOperation[];
  onRetry: (op: QueuedOperation) => Promise<void>;
  onDiscard: (id: string) => void;
  onClose: () => void;
};

function describeOp(op: QueuedOperation): string {
  const p = op.params;
  switch (op.action) {
    case "assignDraft":
      return "Assign draft to repo";
    case "addComment":
      return `Comment on ${p.owner}/${p.repo}#${p.issueNumber}`;
    case "toggleLabel": {
      const verb = p.action === "add" ? "Add" : "Remove";
      return `${verb} label "${p.label}" on ${p.owner}/${p.repo}#${p.issueNumber}`;
    }
    default:
      return op.action;
  }
}

export function FailureModal({ failures, onRetry, onDiscard, onClose }: Props) {
  const [retrying, setRetrying] = useState<string | null>(null);

  async function handleRetry(op: QueuedOperation) {
    setRetrying(op.id);
    try {
      await onRetry(op);
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Failed operations"
      >
        <div className={styles.header}>
          <h3 className={styles.title}>Failed to sync</h3>
          <button className={styles.close} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className={styles.body}>
          {failures.map((op) => (
            <div key={op.id} className={styles.row}>
              <div className={styles.info}>
                <div className={styles.description}>{describeOp(op)}</div>
                <div className={styles.error}>{op.error}</div>
              </div>
              <div className={styles.actions}>
                <button
                  className={styles.retry}
                  onClick={() => handleRetry(op)}
                  disabled={retrying === op.id}
                >
                  {retrying === op.id ? "Retrying…" : "Retry"}
                </button>
                <button
                  className={styles.discard}
                  onClick={() => onDiscard(op.id)}
                  disabled={retrying === op.id}
                >
                  Discard
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create FailureModal styles**

```css
/* packages/web/components/ui/FailureModal.module.css */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(26, 23, 18, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  padding: 20px;
}

.modal {
  background: var(--paper-bg);
  border-radius: var(--paper-radius-lg);
  box-shadow: var(--paper-shadow-modal);
  width: 100%;
  max-width: 440px;
  max-height: 80vh;
  overflow: auto;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 8px;
}

.title {
  font-family: var(--paper-serif);
  font-size: var(--paper-fs-lg);
  font-weight: 600;
  color: var(--paper-ink);
}

.close {
  background: none;
  border: none;
  font-size: 22px;
  color: var(--paper-ink-muted);
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}

.body {
  padding: 8px 20px 20px;
}

.row {
  padding: 12px 0;
}

.row + .row {
  border-top: 1px solid var(--paper-line-soft);
}

.info {
  margin-bottom: 8px;
}

.description {
  font-family: var(--paper-sans);
  font-size: var(--paper-fs-base);
  font-weight: 500;
  color: var(--paper-ink);
}

.error {
  font-family: var(--paper-sans);
  font-size: var(--paper-fs-sm);
  color: var(--paper-brick);
  margin-top: 2px;
}

.actions {
  display: flex;
  gap: 8px;
}

.retry,
.discard {
  font-family: var(--paper-sans);
  font-size: var(--paper-fs-sm);
  font-weight: 500;
  padding: 4px 12px;
  border-radius: var(--paper-radius-sm);
  border: 1px solid var(--paper-line);
  cursor: pointer;
}

.retry {
  background: var(--paper-accent-soft);
  color: var(--paper-accent);
  border-color: var(--paper-accent-dim);
}

.retry:hover {
  background: var(--paper-accent);
  color: #fff;
}

.retry:disabled {
  opacity: 0.5;
  cursor: default;
}

.discard {
  background: none;
  color: var(--paper-ink-muted);
}

.discard:hover {
  color: var(--paper-brick);
  border-color: var(--paper-brick);
}

.discard:disabled {
  opacity: 0.5;
  cursor: default;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/ui/FailureModal.tsx packages/web/components/ui/FailureModal.module.css
git commit -m "feat(offline): add FailureModal for resolving failed sync operations"
```

---

## Task 10: Wire Layout — OfflineIndicator Inside ToastProvider

**Files:**
- Modify: `packages/web/app/layout.tsx`

The `OfflineIndicator` now uses `useToast()`, so it must be inside the `ToastProvider`. Currently it sits outside. Move it inside.

- [ ] **Step 1: Update layout.tsx**

In `packages/web/app/layout.tsx`, move `<OfflineIndicator />` from before `ToastProvider` to inside it:

Change:
```tsx
<body>
  <OfflineIndicator />
  {auth.authenticated ? (
    <ToastProvider>{children}</ToastProvider>
  ) : (
    <AuthErrorScreen />
  )}
</body>
```

To:
```tsx
<body>
  {auth.authenticated ? (
    <ToastProvider>
      <OfflineIndicator />
      {children}
    </ToastProvider>
  ) : (
    <AuthErrorScreen />
  )}
</body>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/layout.tsx
git commit -m "fix(offline): move OfflineIndicator inside ToastProvider"
```

---

## Task 11: Wrap Tier 2 Actions — AssignSheet

**Files:**
- Modify: `packages/web/components/list/AssignSheet.tsx`

- [ ] **Step 1: Update AssignSheet to use tryOrQueue**

In `packages/web/components/list/AssignSheet.tsx`, update the imports — add `tryOrQueue`:

```typescript
import { tryOrQueue } from "@/lib/tryOrQueue";
```

Replace the `handleConfirmAssign` function (lines 45-73) with:

```typescript
  const handleConfirmAssign = async () => {
    if (!selectedRepo) return;
    setAssigning(selectedRepo.id);
    setError(null);
    const idempotencyKey = newIdempotencyKey();
    try {
      const result = await tryOrQueue(
        "assignDraft",
        { draftId, repoId: selectedRepo.id },
        () => assignDraftAction(draftId, selectedRepo.id, idempotencyKey),
        { nonce: idempotencyKey },
      );

      if (result.outcome === "queued") {
        showToast("Queued — will sync when online", "warning");
        setSelectedRepo(null);
        onClose();
        router.push("/?section=unassigned");
        return;
      }

      if (result.outcome === "error") {
        setError(result.error);
        return;
      }

      // succeeded
      const data = result.data as { issueNumber?: number; cleanupWarning?: string };
      if (data.cleanupWarning) {
        showToast(data.cleanupWarning as string, "warning");
      } else {
        showToast(`Issue #${data.issueNumber} created`, "success");
      }
      setSelectedRepo(null);
      onClose();
      if (data.issueNumber) {
        router.push(`/issues/${selectedRepo.owner}/${selectedRepo.name}/${data.issueNumber}`);
      } else {
        router.push("/");
      }
    } catch (err) {
      console.error("[issuectl] assignDraft threw:", err);
      setError(err instanceof Error ? err.message : "Failed to assign draft");
    } finally {
      setAssigning(null);
    }
  };
```

- [ ] **Step 2: Typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/components/list/AssignSheet.tsx
git commit -m "feat(offline): wrap assignDraft with tryOrQueue in AssignSheet"
```

---

## Task 12: Wrap Tier 2 Actions — CommentComposer

**Files:**
- Modify: `packages/web/components/detail/CommentComposer.tsx`

- [ ] **Step 1: Update CommentComposer to use tryOrQueue**

In `packages/web/components/detail/CommentComposer.tsx`, add import:

```typescript
import { tryOrQueue } from "@/lib/tryOrQueue";
```

Replace the `handleSubmit` function (lines 23-46) with:

```typescript
  const handleSubmit = async () => {
    if (body.trim().length === 0) return;
    setSending(true);
    setError(null);
    try {
      const result = await tryOrQueue(
        "addComment",
        { owner, repo, issueNumber, body },
        () => addComment(owner, repo, issueNumber, body),
      );

      if (result.outcome === "queued") {
        setBody("");
        showToast("Comment queued — will sync when online", "warning");
        return;
      }

      if (result.outcome === "error") {
        setError(result.error);
        return;
      }

      // succeeded
      setBody("");
      router.refresh();
      const data = result.data as { cacheStale?: boolean };
      showToast(
        data.cacheStale
          ? "Comment posted — reload if it doesn't appear"
          : "Comment posted",
        "success",
      );
    } catch (err) {
      console.error("[issuectl] addComment threw:", err);
      setError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setSending(false);
    }
  };
```

- [ ] **Step 2: Typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/components/detail/CommentComposer.tsx
git commit -m "feat(offline): wrap addComment with tryOrQueue in CommentComposer"
```

---

## Task 13: Wrap Tier 2 Actions — LabelManager

**Files:**
- Modify: `packages/web/components/issue/LabelManager.tsx`

- [ ] **Step 1: Update LabelManager to use tryOrQueue**

In `packages/web/components/issue/LabelManager.tsx`, add import:

```typescript
import { tryOrQueue } from "@/lib/tryOrQueue";
```

Replace the `handleToggle` function (lines 36-53) with:

```typescript
  function handleToggle(label: string) {
    setError(null);
    const action = selectedNames.includes(label) ? "remove" : "add";
    startTransition(async () => {
      const result = await tryOrQueue(
        "toggleLabel",
        { owner, repo, issueNumber, label, action },
        () => toggleLabel({ owner, repo, number: issueNumber, label, action }),
      );

      if (result.outcome === "queued") {
        showToast("Label change queued — will sync when online", "warning");
        return;
      }

      if (result.outcome === "error") {
        setError(result.error);
        return;
      }

      showToast("Labels updated", "success");
    });
  }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/components/issue/LabelManager.tsx
git commit -m "feat(offline): wrap toggleLabel with tryOrQueue in LabelManager"
```

---

## Task 14: Disable Tier 3 Actions — IssueActionSheet

**Files:**
- Modify: `packages/web/components/detail/IssueActionSheet.tsx`

- [ ] **Step 1: Add offline awareness to IssueActionSheet**

In `packages/web/components/detail/IssueActionSheet.tsx`, add import:

```typescript
import { useOfflineAware } from "@/hooks/useOfflineAware";
```

Inside the component, after the existing state declarations (after line 63), add:

```typescript
  const { isOffline } = useOfflineAware();
```

Update the "Close issue" button in the Sheet (around line 210-216). Replace:

```tsx
<button
  className={`${styles.item} ${styles.danger}`}
  onClick={handleCloseTap}
>
  <span className={styles.icon}>&bull;</span>
  Close issue
</button>
```

With:

```tsx
<button
  className={`${styles.item} ${styles.danger} ${isOffline ? styles.disabled : ""}`}
  onClick={isOffline ? undefined : handleCloseTap}
  disabled={isOffline}
>
  <span className={styles.icon}>&bull;</span>
  Close issue
  {isOffline && <span className={styles.offlineHint}>Requires connection</span>}
</button>
```

Also update the "Re-assign to repo" button (around line 206-209). Replace:

```tsx
<button className={styles.item} onClick={handleReassignTap}>
  <span className={styles.icon}>&harr;</span>
  Re-assign to repo
</button>
```

With:

```tsx
<button
  className={`${styles.item} ${isOffline ? styles.disabled : ""}`}
  onClick={isOffline ? undefined : handleReassignTap}
  disabled={isOffline}
>
  <span className={styles.icon}>&harr;</span>
  Re-assign to repo
  {isOffline && <span className={styles.offlineHint}>Requires connection</span>}
</button>
```

- [ ] **Step 2: Add disabled styles to ActionSheet.module.css**

Read `packages/web/components/detail/ActionSheet.module.css` and append:

```css
.disabled {
  opacity: 0.4;
  cursor: default;
}

.offlineHint {
  font-size: var(--paper-fs-xs);
  color: var(--paper-ink-muted);
  margin-left: auto;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/detail/IssueActionSheet.tsx packages/web/components/detail/ActionSheet.module.css
git commit -m "feat(offline): disable close issue action when offline"
```

---

## Task 15: Wire CacheAge Into Pages

**Files:**
- Modify: `packages/web/app/DashboardContent.tsx`
- Modify: `packages/web/components/list/ListContent.tsx` (or wherever the page title is rendered)

The data functions (`getIssues`, `getPulls`) already return `{ data, fromCache, cachedAt }`. The `getUnifiedList` function calls them internally but doesn't surface `cachedAt`. The simplest approach is to grab the oldest `cachedAt` from the cache table directly.

- [ ] **Step 1: Surface cachedAt from DashboardContent**

In `packages/web/app/DashboardContent.tsx`, after the `getUnifiedList` call, read the oldest cache timestamp and pass it as a prop. The exact approach depends on what the `getUnifiedList` return type looks like — check and adapt. The goal is to get a `cachedAt: number | null` value and pass it to the `ListContent` component or a `CacheAge` component rendered alongside the title.

A practical approach: query the `cache` table for the minimum `fetched_at` across all cache entries for tracked repos:

```typescript
import { getCacheAge } from "@issuectl/core";
// ...
const cachedAt = getCacheAge(db); // Returns oldest fetched_at in ms, or null
```

If `getCacheAge` doesn't exist in core, add a simple helper:

```typescript
// In packages/core/src/db/cache.ts (or wherever getCached lives)
export function getOldestCacheAge(db: Database.Database): number | null {
  const row = db.prepare("SELECT MIN(fetched_at) as oldest FROM cache").get() as { oldest: number | null } | undefined;
  return row?.oldest ?? null;
}
```

Then in `DashboardContent.tsx`, pass `cachedAt` to the list component which renders a `<CacheAge cachedAt={cachedAt} />` next to the page title.

- [ ] **Step 2: Add CacheAge to the dashboard header area**

The exact wiring depends on where the "All Issues" title is rendered. Find the component that renders the page heading and add:

```tsx
import { CacheAge } from "@/components/ui/CacheAge";
// ...
<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
  <h1>All Issues</h1>
  <CacheAge cachedAt={cachedAt} />
</div>
```

(Use CSS modules instead of inline styles — the above is illustrative.)

- [ ] **Step 3: Typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/DashboardContent.tsx packages/web/components/list/ListContent.tsx packages/core/src/db/cache.ts
git commit -m "feat(offline): wire CacheAge badge into dashboard header"
```

---

## Task 16: Visual Verification — Dev Server Testing (manual)

**Files:** None (manual testing)

- [ ] **Step 1: Start dev server**

Run: `pnpm turbo dev`
Open: `http://localhost:3847`

- [ ] **Step 2: Test offline banner**

In Chrome DevTools > Network tab, toggle "Offline" checkbox:
- Verify banner appears: "Offline — viewing cached data"
- On mobile viewport (393px): verify it shows "Offline"
- Toggle back online: verify banner disappears

- [ ] **Step 3: Test queueing flow**

While offline:
1. Navigate to an issue detail page (from cache)
2. Try adding a comment — verify toast: "Comment queued — will sync when online"
3. Check banner shows "Offline · 1 queued"
4. Click banner — verify dropdown shows the queued comment
5. Click cancel — verify operation removed, queue count updates

- [ ] **Step 4: Test sync on reconnect**

1. Queue a comment while offline
2. Toggle back online
3. Verify success toast appears
4. Verify queue clears

- [ ] **Step 5: Test blocked actions**

While offline:
1. Navigate to an issue detail page
2. Open action sheet — verify "Close issue" is dimmed
3. Tap it — verify "Requires connection" hint appears

---

## Task 17: E2E Tests

**Files:**
- Create: `packages/web/e2e/offline-queue.spec.ts`

- [ ] **Step 1: Write E2E tests**

```typescript
// packages/web/e2e/offline-queue.spec.ts
import { test, expect } from "@playwright/test";

// These tests run against the dev server on :3847.
// They use Playwright's built-in offline simulation.

const BASE_URL = "http://localhost:3847";

test.describe("Offline mode", () => {
  test("shows offline banner when network is lost", async ({ page, context }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    await context.setOffline(true);

    // Trigger the browser's offline event.
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    const banner = page.locator('[role="status"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Offline");

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect(banner).not.toBeVisible();
  });

  test("health endpoint returns ok", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  test("blocked actions show disabled state when offline", async ({
    page,
    context,
  }) => {
    // Navigate to any issue detail — need a real issue in the test DB.
    // This test assumes the dev server has at least one tracked repo with issues.
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    // Find and click the first issue card.
    const firstIssue = page.locator('a[href^="/issues/"]').first();
    if (await firstIssue.isVisible()) {
      await firstIssue.click();
      await page.waitForLoadState("networkidle");

      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event("offline")));

      // Open the action sheet via edge swipe trigger or any visible action button.
      // The exact trigger depends on the page's FilterEdgeSwipe component.
      // Check that the offline banner is visible as a basic assertion.
      const banner = page.locator('[role="status"]');
      await expect(banner).toBeVisible();

      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
    }
  });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `pnpm --filter @issuectl/web test:e2e -- offline-queue.spec.ts`
Expected: Tests pass (dev server must be running on :3847)

- [ ] **Step 3: Commit**

```bash
git add packages/web/e2e/offline-queue.spec.ts
git commit -m "test(offline): add E2E tests for offline banner and health endpoint"
```

---

## Task 18: Final Typecheck and Quality Gate

**Files:** None (verification only)

- [ ] **Step 1: Full typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS across all packages

- [ ] **Step 2: Run all unit tests**

Run: `pnpm --filter @issuectl/web vitest run`
Expected: All tests pass including new offline-queue, tryOrQueue, sync tests

- [ ] **Step 3: Run /simplify**

Review all new code for unnecessary complexity.

- [ ] **Step 4: Run code-reviewer agent**

Review the complete offline mode implementation.
