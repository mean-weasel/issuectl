# Offline Mode Design

**Issue:** #138
**Date:** 2026-04-19
**Status:** Draft

## Context

issuectl is a cross-repo GitHub issue command center. The web dashboard runs as a Next.js app on `localhost:3847`, backed by a SQLite database at `~/.issuectl/issuectl.db`. The primary access pattern is remote — the server runs on an always-on machine and users access it through a Cloudflare Tunnel from phones, laptops, and other devices.

This means "offline" has three failure modes:
1. **Device offline** — the user's phone/laptop loses connectivity. Can't reach the tunnel.
2. **Tunnel down** — device has internet but the Cloudflare Tunnel is broken.
3. **Server can't reach GitHub** — tunnel works, server is reachable, but `api.github.com` is unreachable.

A pure server-side queue handles #3 but is useless for #1 and #2. A pure client-side queue handles #1 and #2 but misses #3. The design uses a client-first queue that handles all three through a single mechanism.

## Architecture: Client-First Queue with Server-Side Replay

The queue lives in the browser (IndexedDB). Server actions stay unchanged — they don't know about the queue. The queue is a client-side retry layer on top of existing server actions.

### Flow

```
User triggers action
  → Client checks navigator.onLine
  → If offline: queue in IndexedDB, show "Queued" toast
  → If online: call server action
    → Success: show success toast
    → Network error (fetch fails / tunnel unreachable): queue in IndexedDB, show "Queued" toast
    → Server returns { success: false, error: "network" | "timeout" }: queue in IndexedDB, show "Queued" toast
    → Server returns non-network error (validation, 404, etc.): show error, do NOT queue
```

### Sync on Reconnect

```
online event fires
  → Ping GET /api/health
  → If unreachable: do nothing, wait for next online event
  → If reachable:
    → Read all "pending" operations from IndexedDB (ordered by createdAt)
    → For each, sequentially:
      → Mark "syncing"
      → Call server action with stored params + nonce
      → Success: remove from queue, show success toast
      → Network error: revert to "pending", stop (connection lost again)
      → Non-network error: mark "failed" with error message, continue to next
    → After all processed: call refreshDashboard() to revalidate cached data
    → If any failed: show persistent toast linking to failure resolution modal
```

Operations replay sequentially because they may depend on order (e.g., assign draft creates an issue, then a queued comment targets that issue). With a typical queue of 1-3 items, parallelism has no benefit.

The health check (`/api/health`) confirms end-to-end reachability before replaying. The `online` browser event only means the OS thinks it has a network — the Cloudflare Tunnel may still be down.

## Operation Queue (IndexedDB)

### Storage

A single IndexedDB database `issuectl-offline` with one object store `queued-ops`.

### Schema

```typescript
type QueuedOperation = {
  id:          string          // crypto.randomUUID()
  action:      QueueableAction // "assignDraft" | "addComment" | "toggleLabel"
  params:      Record<string, unknown> // exact server action arguments
  nonce:       string          // idempotency nonce, generated at queue time
  status:      "pending" | "syncing" | "failed"
  error:       string | null   // failure reason after sync attempt
  createdAt:   number          // unix ms
  attemptedAt: number | null   // last sync attempt, unix ms
}
```

### Queueable Actions (Tier 2)

| Action | Params | Server Action |
|---|---|---|
| `assignDraft` | `{ draftId, repoId, nonce }` | `assignDraftAction()` |
| `addComment` | `{ owner, repo, issueNumber, body }` | `addComment()` |
| `toggleLabel` | `{ owner, repo, issueNumber, label, action: "add" \| "remove" }` | `toggleLabel()` |

These are "safe" mutations — they create new data or toggle state. They don't destroy data and have low conflict risk.

### Non-Queueable Actions (Tier 3 — blocked offline)

| Action | Reason |
|---|---|
| `closeIssue` | Destructive — can't undo easily, high conflict risk |
| `mergePull` | Irreversible — merge commits can't be undone |
| `updateIssue` (title/body) | Conflict risk — someone else may have edited |
| `addRepo` | Requires GitHub validation to confirm repo exists |
| `refreshDashboard` | Pointless offline — can't reach GitHub |

### Actions That Already Work Offline (Tier 1)

| Action | Why |
|---|---|
| Create/edit/delete draft | Drafts are local-only (SQLite) |
| Set priority | Local metadata (SQLite) |
| Remove repo | Local operation |
| Update repo settings | Local operation |
| All navigation and filtering | Client-side or cached data |

## Action Tiering & Disabled States

### Tier 1 — Works offline

No change needed. These actions hit SQLite directly through server actions — no GitHub calls involved. When accessing locally, they always work. When accessing remotely via tunnel, they depend on tunnel connectivity (same as every other action). If the tunnel is down, Tier 1 actions fail at the fetch level just like Tier 2/3. The difference is that Tier 1 failures aren't queueable — there's no point retrying a local DB write later since the server state hasn't changed. The user simply retries when the tunnel is back.

### Tier 2 — Queued offline

Buttons look and feel normal. On tap:
- If offline or network error: queues the operation, shows toast "Queued — will sync when online"
- If online and succeeds: normal success toast

The user experience is identical to online — the only difference is the toast message.

### Tier 3 — Blocked offline

- Desktop: `opacity: 0.4`, `pointer-events: none`
- Mobile: button stays tappable. Tap shows a brief inline "Requires connection" message below the button. Message fades after 2 seconds. No modal, no tooltip.

A small lock/cloud-off icon overlays the button to signal unavailability.

### Implementation

A `useOfflineAware()` hook exposes `{ isOffline, canQueue, isBlocked }`. The tier mapping is a config object:

```typescript
const ACTION_TIERS: Record<string, 1 | 2 | 3> = {
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
```

## Failure Interception

### `tryOrQueue(actionName, params, serverActionFn)`

A helper that wraps server action calls in client components:

```typescript
type TryOrQueueResult =
  | { outcome: "succeeded"; data: unknown }
  | { outcome: "queued" }
  | { outcome: "error"; error: string }

async function tryOrQueue(
  action: QueueableAction,
  params: Record<string, unknown>,
  serverActionFn: () => Promise<ActionResult>,
): Promise<TryOrQueueResult>
```

Logic:
1. **Pre-flight:** if `navigator.onLine === false`, queue immediately, return `{ outcome: "queued" }`.
2. **Call server action.** Catch fetch-level errors (TypeError, AbortError) — these mean the server/tunnel is unreachable. Queue and return `{ outcome: "queued" }`.
3. **Check server response.** If `{ success: false }` with a network/timeout error class, queue and return `{ outcome: "queued" }`. If non-network error, return `{ outcome: "error", error }`.
4. **Success:** return `{ outcome: "succeeded", data }`.

For actions that don't already have a nonce (e.g., `addComment`, `toggleLabel`), `tryOrQueue` generates one via `crypto.randomUUID()` and stores it with the queued operation. On replay, the same nonce is sent — the existing server-side `withIdempotency` deduplicates.

For `assignDraft`, which already uses a two-layer idempotency pattern (outer nonce for UI retries, inner nonce keyed on `draftId`), the client passes its existing nonce through. `tryOrQueue` stores the nonce it receives rather than generating a new one, preserving the idempotency chain.

## UI Design

### Offline Banner (enhanced OfflineIndicator)

The existing `OfflineIndicator` component is expanded. It already listens to `online`/`offline` events.

**States:**

| Connection | Queue | Renders |
|---|---|---|
| Online | Empty | Nothing |
| Online | Syncing | Nothing (toasts handle feedback) |
| Online | Has failures | Persistent toast (not in banner) |
| Offline | Empty | Banner: "Offline — viewing cached data" |
| Offline | Has items (desktop) | Banner: "Offline — viewing cached data · N operations queued" |
| Offline | Has items (mobile) | Banner: "Offline · N queued" |

The banner uses the existing brick-red styling (`var(--paper-brick)`, white text, slide-down animation).

### Banner Dropdown

When the banner shows a queue count, tapping it expands a dropdown/sheet listing each queued operation:

- Each row shows: operation icon, description ("Assign 'Fix auth bug' → acme/api"), cancel button
- Cancel removes the operation from IndexedDB
- Dropdown closes on outside tap or when the banner collapses (going online)

On mobile, this renders as a bottom sheet rather than a dropdown.

### Failure Resolution Modal

Triggered by the persistent failure toast ("N operations failed to sync · View"). Opens a modal showing each failed operation:

- What was attempted (same description as the dropdown)
- Why it failed (error message from the server action)
- **Retry** button — re-attempts the server action
- **Discard** button — removes from queue

The modal uses the existing `ConfirmDialog` pattern for consistency.

### Cache Age Badge

A `<CacheAge cachedAt={timestamp} />` component:

- Hidden when data is fresh (fetched < 60 seconds ago)
- Shows relative time: "Cached 5m ago", "Cached 2h ago", "Cached 1d ago"
- Updates on a 60-second `setInterval`
- Styled as a subtle pill: `var(--paper-bg-warmer)` background, `var(--paper-ink-muted)` text, small font
- Placed next to page titles on the dashboard and issue detail pages

Data functions already return `{ data, fromCache, cachedAt }`. Pages pass `cachedAt` through.

## Auto-Refresh on Reconnect

After the sync queue finishes replaying (or immediately if empty), the `useSyncOnReconnect` hook calls `refreshDashboard()`. This:

1. Force-refetches all issue/PR lists from GitHub via the existing SWR cache functions
2. Updates `fetched_at` timestamps in the cache table
3. Calls `revalidatePath("/")` to trigger Server Component re-renders

Refresh runs after sync so that freshly created issues (from replayed draft assignments) appear in the refreshed data.

The refresh is non-disruptive — Next.js soft-navigates without scroll jumps or form state loss.

## Health Endpoint

A new route at `packages/web/app/api/health/route.ts`:

```typescript
export function GET() {
  return Response.json({ ok: true });
}
```

No auth, no DB, no GitHub. Confirms the server is reachable through the tunnel. Used by the sync logic to verify end-to-end connectivity before replaying queued operations.

## New Files

| File | Purpose |
|---|---|
| `packages/web/lib/offline-queue.ts` | IndexedDB wrapper: enqueue, dequeue, listPending, markFailed, markSyncing, remove |
| `packages/web/lib/sync.ts` | Reconnect replay logic: health check, sequential replay, failure handling |
| `packages/web/lib/tryOrQueue.ts` | Server action wrapper: pre-flight check, failure interception, queueing |
| `packages/web/app/api/health/route.ts` | Health check endpoint |
| `packages/web/components/ui/CacheAge.tsx` | Relative time badge component |
| `packages/web/components/ui/CacheAge.module.css` | Cache age styles |
| `packages/web/components/ui/QueueDropdown.tsx` | Banner dropdown listing queued operations |
| `packages/web/components/ui/QueueDropdown.module.css` | Queue dropdown styles |
| `packages/web/components/ui/FailureModal.tsx` | Failed operation resolution modal |
| `packages/web/components/ui/FailureModal.module.css` | Failure modal styles |
| `packages/web/hooks/useOfflineAware.ts` | Offline state + action tier logic |
| `packages/web/hooks/useSyncOnReconnect.ts` | Sync hook for root layout |

## Modified Files

| File | Change |
|---|---|
| `packages/web/components/ui/OfflineIndicator.tsx` | Add queue count display, dropdown trigger, responsive text |
| `packages/web/components/ui/OfflineIndicator.module.css` | Dropdown styles, responsive banner text |
| `packages/web/app/layout.tsx` | Add `useSyncOnReconnect` hook |
| Client components calling Tier 2 actions | Wrap calls with `tryOrQueue` |
| Client components calling Tier 3 actions | Add offline-aware disabled state |
| Page Server Components | Pass `cachedAt` to `CacheAge` component |

## Testing

### Unit Tests (Vitest)

- **`offline-queue.test.ts`** — enqueue/dequeue/markFailed/remove against `fake-indexeddb`
- **`sync.test.ts`** — replay success, network-error stops processing, non-network error marks failed and continues, health check failure aborts
- **`tryOrQueue.test.ts`** — pre-flight offline detection, post-failure queueing, non-network errors pass through, nonce generation

### Component Tests (Vitest + React Testing Library)

- **`OfflineIndicator`** — correct banner text for each state combination
- **`CacheAge`** — correct relative time strings, hidden when fresh
- **`QueueDropdown`** — renders operations, cancel removes from queue
- **Blocked actions** — dimmed state renders, "Requires connection" message on tap

### E2E Tests (Playwright CLI)

- **Offline → queue → reconnect:** `context.setOffline(true)`, create draft, assign to repo (queued), verify toast. Set online, verify sync + success toast.
- **Failure resolution:** Mock server action to return non-network error on replay. Verify failure toast, open modal, retry/discard.
- **Cache age:** Load dashboard, verify age badge with stale data.
- **Blocked actions:** Go offline, verify close/merge buttons disabled, tap shows "Requires connection."

## Non-Goals

- **Service worker / Background Sync API** — adds significant complexity for marginal benefit. The `online` event + health check covers the same ground.
- **Offline-first reads** — the SWR cache already handles this. No need for a separate offline read layer.
- **Conflict resolution UI** — operations are retried once. If they fail, the user decides (retry or discard). No automatic merge/conflict resolution.
- **Queue persistence across browser data clears** — IndexedDB is the best browser storage available. If the user clears all site data, the queue is lost. The operations are low-stakes (comments, labels, draft assignments).
- **Queueing destructive operations** — close, merge, and issue edits are blocked offline. This is a deliberate safety boundary.
