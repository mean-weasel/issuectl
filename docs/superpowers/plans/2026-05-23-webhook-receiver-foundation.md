# Webhook Receiver Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 1 of issue 506: a secure GitHub webhook receiver foundation with persisted delivery/event/intent records, debounce state helpers, diagnostics, CLI visibility, and documentation, without launching agents yet.

**Architecture:** Add core DB schema and helper modules first, then layer a server-level raw-body webhook handler before Next's request handler. The receiver verifies HMAC, binds the signed payload to the configured repo, stores replay tombstones and redacted event metadata, and merges gating-relevant deliveries into a recoverable intent buffer. Launch integration, PR sessions, daemon-mediated mutations, and notifications remain out of scope.

**Tech Stack:** TypeScript, Node HTTP server, better-sqlite3, Octokit payload conventions, commander CLI, Vitest, pnpm/Turborepo.

---

## Parallel Work Layout

These can run in parallel after Task 1 lands:

- Worker A: Tasks 2-4, schema/types/settings/repo helpers.
- Worker B: Tasks 5-6, webhook receiver verification and event handling.
- Worker C: Task 7, debounce/lease/recovery worker helpers.
- Worker D: Tasks 8-9, CLI visibility and docs.

Keep PR auto-review, session target refactors, direct pushes, completion protocol, and notifications out of this plan.

## File Structure

- Modify `packages/core/src/types.ts`: add webhook-related types and setting keys.
- Modify `packages/core/src/db/schema.ts`: fresh-install tables and schema version.
- Modify `packages/core/src/db/migrations.ts`: migration for existing DBs.
- Modify `packages/core/src/db/settings.ts`: webhook default settings.
- Modify `packages/core/src/db/repos.ts`: repo webhook columns and update helpers.
- Create `packages/core/src/db/webhooks.ts`: delivery, event, and intent DB helpers.
- Create `packages/core/src/db/webhooks.test.ts`: helper and invariant tests.
- Modify `packages/core/src/db/schema-invariants.test.ts`: fresh/migrated schema checks.
- Create `packages/web/lib/github-webhook-handler.ts`: raw HTTP webhook receiver.
- Create `packages/web/lib/github-webhook-handler.test.ts`: HMAC, repo binding, dedup, and intent tests.
- Modify `packages/web/server.ts`: route webhook requests before Next's handler.
- Create `packages/web/lib/webhook-intent-worker.ts`: claim/recover/expire worker loop.
- Create `packages/web/lib/webhook-intent-worker.test.ts`: worker state transition tests.
- Create `packages/cli/src/commands/webhook.ts`: `issuectl webhook tail/status`.
- Modify `packages/cli/src/index.ts`: register webhook commands.
- Create `packages/cli/src/commands/webhook.test.ts`: CLI output tests.
- Create `docs/specs/2026-05-23-webhooks-design.md`: Phase 1 operational docs.

## Shared Contracts

Use these exact names so workers can stay disjoint:

```ts
export type WebhookTargetType = "issue" | "pr";
export type WebhookIntentStatus =
  | "pending"
  | "processing"
  | "deferred"
  | "launched"
  | "skipped_locked"
  | "skipped_optout"
  | "expired"
  | "failed";
export type WebhookPayloadMode = "metadata" | "raw";
```

Receiver responses:

```ts
type WebhookReceiverResponse =
  | { ok: true; deduped: true }
  | { ok: true; eventId: number; intentId: number | null }
  | { ok: false; error: string };
```

Initial Phase 1 event classification:

```ts
const GATING_RELEVANT_EVENTS = new Set([
  "issues:opened",
  "issues:labeled",
  "issues:unlabeled",
  "issues:closed",
  "issues:reopened",
  "pull_request:opened",
  "pull_request:labeled",
  "pull_request:unlabeled",
  "pull_request:synchronize",
  "pull_request:closed",
]);
```

Comment-command parsing is out of scope for Phase 1; `issue_comment` and `pull_request_review_comment` should be recorded as events but should not create intents yet.

---

### Task 1: Pin Contracts and Current Schema Baseline

**Files:**
- Modify: `packages/core/src/types.ts`
- Test: `packages/core/src/db/schema-invariants.test.ts`

- [ ] **Step 1: Add shared webhook type exports**

In `packages/core/src/types.ts`, add these exported unions near the existing core type exports:

```ts
export type WebhookTargetType = "issue" | "pr";

export type WebhookIntentStatus =
  | "pending"
  | "processing"
  | "deferred"
  | "launched"
  | "skipped_locked"
  | "skipped_optout"
  | "expired"
  | "failed";

export type WebhookPayloadMode = "metadata" | "raw";
```

- [ ] **Step 2: Extend `SettingKey`**

In `packages/core/src/types.ts`, add these keys to the existing `SettingKey` union:

```ts
  | "webhook_debounce_seconds"
  | "webhook_max_debounce_seconds"
  | "max_webhook_launches_per_minute"
  | "max_webhook_queue_depth"
  | "max_webhook_intent_age_minutes"
  | "max_concurrent_webhook_agents"
  | "public_webhook_base_url"
```

- [ ] **Step 3: Run the focused typecheck**

Run:

```bash
pnpm --dir packages/core typecheck
```

Expected: PASS. If the `SettingKey` union is located differently than expected, update that union and rerun.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "chore: add webhook shared types"
```

### Task 2: Add Webhook Schema and Migration

**Files:**
- Modify: `packages/core/src/db/schema.ts`
- Modify: `packages/core/src/db/migrations.ts`
- Modify: `packages/core/src/db/schema-invariants.test.ts`

- [ ] **Step 1: Write schema invariant tests first**

Add tests in `packages/core/src/db/schema-invariants.test.ts` that assert:

```ts
expect(tableNames).toContain("webhook_deliveries");
expect(tableNames).toContain("webhook_events");
expect(tableNames).toContain("webhook_intents");
```

Also assert these indexes exist:

```ts
expect(indexNames).toContain("idx_webhook_events_target");
expect(indexNames).toContain("idx_webhook_intents_active_target");
```

- [ ] **Step 2: Run schema invariant tests and verify failure**

Run:

```bash
pnpm --dir packages/core test -- schema-invariants
```

Expected: FAIL because the webhook tables do not exist yet.

- [ ] **Step 3: Bump schema version**

In `packages/core/src/db/schema.ts`, change:

```ts
const SCHEMA_VERSION = 16;
```

to:

```ts
const SCHEMA_VERSION = 17;
```

- [ ] **Step 4: Add fresh-install tables**

Append this SQL to `CREATE_TABLES` in `packages/core/src/db/schema.ts`, before `schema_version`:

```sql
  CREATE TABLE IF NOT EXISTS webhook_deliveries (
    delivery_id    TEXT PRIMARY KEY,
    repo_id        INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    event_type     TEXT NOT NULL,
    received_at    INTEGER NOT NULL,
    retained_until INTEGER
  );

  CREATE TABLE IF NOT EXISTS webhook_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_id   TEXT NOT NULL UNIQUE REFERENCES webhook_deliveries(delivery_id),
    repo_id       INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    event_type    TEXT NOT NULL,
    action        TEXT,
    sender_login  TEXT,
    target_type   TEXT CHECK (target_type IN ('issue', 'pr') OR target_type IS NULL),
    target_number INTEGER,
    payload_json  TEXT,
    received_at   INTEGER NOT NULL,
    intent_id     INTEGER REFERENCES webhook_intents(id)
  );

  CREATE INDEX IF NOT EXISTS idx_webhook_events_target
    ON webhook_events(repo_id, target_type, target_number);

  CREATE TABLE IF NOT EXISTS webhook_intents (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id               INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    target_type           TEXT NOT NULL CHECK (target_type IN ('issue', 'pr')),
    target_number         INTEGER NOT NULL,
    first_signal_at       INTEGER NOT NULL,
    last_signal_at        INTEGER NOT NULL,
    scheduled_at          INTEGER NOT NULL,
    processing_started_at INTEGER,
    lease_expires_at      INTEGER,
    generation            INTEGER NOT NULL DEFAULT 1,
    desired_head_sha      TEXT,
    signal_count          INTEGER NOT NULL DEFAULT 1,
    status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'processing', 'deferred', 'launched', 'skipped_locked', 'skipped_optout', 'expired', 'failed')),
    resolved_at           INTEGER,
    deployment_id         INTEGER REFERENCES deployments(id),
    failure_reason        TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_intents_active_target
    ON webhook_intents(repo_id, target_type, target_number)
    WHERE status IN ('pending', 'processing', 'deferred');
```

- [ ] **Step 5: Add repo columns migration**

In `packages/core/src/db/migrations.ts`, add migration version 17:

```ts
  {
    version: 17,
    up(db) {
      db.exec(`
        ALTER TABLE repos ADD COLUMN auto_launch_issues INTEGER NOT NULL DEFAULT 0 CHECK (auto_launch_issues IN (0, 1));
        ALTER TABLE repos ADD COLUMN auto_review_prs INTEGER NOT NULL DEFAULT 0 CHECK (auto_review_prs IN (0, 1));
        ALTER TABLE repos ADD COLUMN issue_agent TEXT NOT NULL DEFAULT 'claude' CHECK (issue_agent IN ('claude', 'codex'));
        ALTER TABLE repos ADD COLUMN review_agent TEXT NOT NULL DEFAULT 'claude' CHECK (review_agent IN ('claude', 'codex'));
        ALTER TABLE repos ADD COLUMN webhook_secret TEXT;
        ALTER TABLE repos ADD COLUMN webhook_id INTEGER;
        ALTER TABLE repos ADD COLUMN review_preamble TEXT;
        ALTER TABLE repos ADD COLUMN webhook_payload_mode TEXT NOT NULL DEFAULT 'metadata' CHECK (webhook_payload_mode IN ('metadata', 'raw'));

        ALTER TABLE deployments ADD COLUMN triggered_by TEXT NOT NULL DEFAULT 'manual'
          CHECK (triggered_by IN ('manual', 'webhook', 'comment_command'));

        CREATE TABLE IF NOT EXISTS webhook_deliveries (
          delivery_id    TEXT PRIMARY KEY,
          repo_id        INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
          event_type     TEXT NOT NULL,
          received_at    INTEGER NOT NULL,
          retained_until INTEGER
        );

        CREATE TABLE IF NOT EXISTS webhook_events (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          delivery_id   TEXT NOT NULL UNIQUE REFERENCES webhook_deliveries(delivery_id),
          repo_id       INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
          event_type    TEXT NOT NULL,
          action        TEXT,
          sender_login  TEXT,
          target_type   TEXT CHECK (target_type IN ('issue', 'pr') OR target_type IS NULL),
          target_number INTEGER,
          payload_json  TEXT,
          received_at   INTEGER NOT NULL,
          intent_id     INTEGER REFERENCES webhook_intents(id)
        );

        CREATE INDEX IF NOT EXISTS idx_webhook_events_target
          ON webhook_events(repo_id, target_type, target_number);

        CREATE TABLE IF NOT EXISTS webhook_intents (
          id                    INTEGER PRIMARY KEY AUTOINCREMENT,
          repo_id               INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
          target_type           TEXT NOT NULL CHECK (target_type IN ('issue', 'pr')),
          target_number         INTEGER NOT NULL,
          first_signal_at       INTEGER NOT NULL,
          last_signal_at        INTEGER NOT NULL,
          scheduled_at          INTEGER NOT NULL,
          processing_started_at INTEGER,
          lease_expires_at      INTEGER,
          generation            INTEGER NOT NULL DEFAULT 1,
          desired_head_sha      TEXT,
          signal_count          INTEGER NOT NULL DEFAULT 1,
          status                TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'processing', 'deferred', 'launched', 'skipped_locked', 'skipped_optout', 'expired', 'failed')),
          resolved_at           INTEGER,
          deployment_id         INTEGER REFERENCES deployments(id),
          failure_reason        TEXT
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_intents_active_target
          ON webhook_intents(repo_id, target_type, target_number)
          WHERE status IN ('pending', 'processing', 'deferred');
      `);

      const insert = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
      insert.run("webhook_debounce_seconds", "60");
      insert.run("webhook_max_debounce_seconds", "300");
      insert.run("max_webhook_launches_per_minute", "5");
      insert.run("max_webhook_queue_depth", "100");
      insert.run("max_webhook_intent_age_minutes", "60");
      insert.run("max_concurrent_webhook_agents", "2");
      insert.run("public_webhook_base_url", "");
    },
  },
```

- [ ] **Step 6: Add repo columns to fresh schema**

In the fresh `repos` table in `packages/core/src/db/schema.ts`, add:

```sql
    auto_launch_issues INTEGER NOT NULL DEFAULT 0 CHECK (auto_launch_issues IN (0, 1)),
    auto_review_prs    INTEGER NOT NULL DEFAULT 0 CHECK (auto_review_prs IN (0, 1)),
    issue_agent        TEXT NOT NULL DEFAULT 'claude' CHECK (issue_agent IN ('claude', 'codex')),
    review_agent       TEXT NOT NULL DEFAULT 'claude' CHECK (review_agent IN ('claude', 'codex')),
    webhook_secret     TEXT,
    webhook_id         INTEGER,
    review_preamble    TEXT,
    webhook_payload_mode TEXT NOT NULL DEFAULT 'metadata' CHECK (webhook_payload_mode IN ('metadata', 'raw')),
```

In the fresh `deployments` table, add:

```sql
    triggered_by    TEXT NOT NULL DEFAULT 'manual'
                    CHECK (triggered_by IN ('manual', 'webhook', 'comment_command')),
```

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm --dir packages/core test -- schema
pnpm --dir packages/core typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/db/schema.ts packages/core/src/db/migrations.ts packages/core/src/db/schema-invariants.test.ts
git commit -m "feat: add webhook receiver schema"
```

### Task 3: Add Repo and Setting Helpers

**Files:**
- Modify: `packages/core/src/db/settings.ts`
- Modify: `packages/core/src/db/repos.ts`
- Test: `packages/core/src/db/repos.test.ts`
- Test: `packages/core/src/db/settings.test.ts`

- [ ] **Step 1: Add settings defaults test**

In `packages/core/src/db/settings.test.ts`, add assertions after `seedDefaults(db)`:

```ts
expect(getSetting(db, "webhook_debounce_seconds")).toBe("60");
expect(getSetting(db, "webhook_max_debounce_seconds")).toBe("300");
expect(getSetting(db, "max_webhook_queue_depth")).toBe("100");
expect(getSetting(db, "public_webhook_base_url")).toBe("");
```

- [ ] **Step 2: Add default settings**

In `packages/core/src/db/settings.ts`, append to `DEFAULT_SETTINGS`:

```ts
  { key: "webhook_debounce_seconds", value: "60" },
  { key: "webhook_max_debounce_seconds", value: "300" },
  { key: "max_webhook_launches_per_minute", value: "5" },
  { key: "max_webhook_queue_depth", value: "100" },
  { key: "max_webhook_intent_age_minutes", value: "60" },
  { key: "max_concurrent_webhook_agents", value: "2" },
  { key: "public_webhook_base_url", value: "" },
```

- [ ] **Step 3: Extend repo row mapping**

In `packages/core/src/db/repos.ts`, add fields to `RepoRow`:

```ts
  auto_launch_issues: number;
  auto_review_prs: number;
  issue_agent: string;
  review_agent: string;
  webhook_secret: string | null;
  webhook_id: number | null;
  review_preamble: string | null;
  webhook_payload_mode: string;
```

Map them in `rowToRepo`:

```ts
    autoLaunchIssues: row.auto_launch_issues === 1,
    autoReviewPrs: row.auto_review_prs === 1,
    issueAgent: row.issue_agent as Repo["issueAgent"],
    reviewAgent: row.review_agent as Repo["reviewAgent"],
    webhookSecret: row.webhook_secret,
    webhookId: row.webhook_id,
    reviewPreamble: row.review_preamble,
    webhookPayloadMode: row.webhook_payload_mode as Repo["webhookPayloadMode"],
```

If `Repo` does not yet include these properties, add them in `packages/core/src/types.ts`:

```ts
  autoLaunchIssues: boolean;
  autoReviewPrs: boolean;
  issueAgent: LaunchAgent;
  reviewAgent: LaunchAgent;
  webhookSecret: string | null;
  webhookId: number | null;
  reviewPreamble: string | null;
  webhookPayloadMode: WebhookPayloadMode;
```

- [ ] **Step 4: Add update helper**

In `packages/core/src/db/repos.ts`, add:

```ts
export function updateRepoWebhookSettings(
  db: Database.Database,
  id: number,
  updates: Partial<{
    autoLaunchIssues: boolean;
    autoReviewPrs: boolean;
    issueAgent: Repo["issueAgent"];
    reviewAgent: Repo["reviewAgent"];
    webhookSecret: string | null;
    webhookId: number | null;
    reviewPreamble: string | null;
    webhookPayloadMode: Repo["webhookPayloadMode"];
  }>,
): Repo {
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (updates.autoLaunchIssues !== undefined) {
    fields.push("auto_launch_issues = ?");
    values.push(updates.autoLaunchIssues ? 1 : 0);
  }
  if (updates.autoReviewPrs !== undefined) {
    fields.push("auto_review_prs = ?");
    values.push(updates.autoReviewPrs ? 1 : 0);
  }
  if (updates.issueAgent !== undefined) {
    fields.push("issue_agent = ?");
    values.push(updates.issueAgent);
  }
  if (updates.reviewAgent !== undefined) {
    fields.push("review_agent = ?");
    values.push(updates.reviewAgent);
  }
  if (updates.webhookSecret !== undefined) {
    fields.push("webhook_secret = ?");
    values.push(updates.webhookSecret);
  }
  if (updates.webhookId !== undefined) {
    fields.push("webhook_id = ?");
    values.push(updates.webhookId);
  }
  if (updates.reviewPreamble !== undefined) {
    fields.push("review_preamble = ?");
    values.push(updates.reviewPreamble);
  }
  if (updates.webhookPayloadMode !== undefined) {
    fields.push("webhook_payload_mode = ?");
    values.push(updates.webhookPayloadMode);
  }

  if (fields.length > 0) {
    values.push(id);
    db.prepare(`UPDATE repos SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  }

  const updated = getRepoById(db, id);
  if (!updated) throw new Error(`Repo with id ${id} not found`);
  return updated;
}
```

- [ ] **Step 5: Add repo helper test**

In `packages/core/src/db/repos.test.ts`, add:

```ts
it("updates webhook settings for a repo", () => {
  const repo = addRepo(db, { owner: "mean-weasel", name: "issuectl" });

  const updated = updateRepoWebhookSettings(db, repo.id, {
    autoLaunchIssues: true,
    autoReviewPrs: true,
    issueAgent: "codex",
    reviewAgent: "claude",
    webhookSecret: "secret",
    webhookId: 123,
    webhookPayloadMode: "raw",
  });

  expect(updated.autoLaunchIssues).toBe(true);
  expect(updated.autoReviewPrs).toBe(true);
  expect(updated.issueAgent).toBe("codex");
  expect(updated.reviewAgent).toBe("claude");
  expect(updated.webhookSecret).toBe("secret");
  expect(updated.webhookId).toBe(123);
  expect(updated.webhookPayloadMode).toBe("raw");
});
```

- [ ] **Step 6: Run tests**

```bash
pnpm --dir packages/core test -- repos settings
pnpm --dir packages/core typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/db/settings.ts packages/core/src/db/repos.ts packages/core/src/db/repos.test.ts packages/core/src/db/settings.test.ts
git commit -m "feat: add webhook repo settings helpers"
```

### Task 4: Add Webhook DB Helpers

**Files:**
- Create: `packages/core/src/db/webhooks.ts`
- Create: `packages/core/src/db/webhooks.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create failing tests**

Create `packages/core/src/db/webhooks.test.ts` with tests for:

```ts
it("records a delivery and event once");
it("dedupes repeated delivery ids");
it("merges repeated signals into one active intent");
it("allows one active intent per target across pending processing deferred");
it("claims and recovers stale processing intents");
```

Use `initSchema`, `runMigrations`, `seedDefaults`, and `addRepo` like existing DB tests.

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm --dir packages/core test -- webhooks
```

Expected: FAIL because `packages/core/src/db/webhooks.ts` does not exist.

- [ ] **Step 3: Implement DB helper module**

Create `packages/core/src/db/webhooks.ts` exporting:

```ts
export type RecordWebhookEventInput = {
  deliveryId: string;
  repoId: number;
  eventType: string;
  action?: string | null;
  senderLogin?: string | null;
  targetType?: WebhookTargetType | null;
  targetNumber?: number | null;
  payloadJson?: string | null;
  receivedAt: number;
};

export type RecordWebhookEventResult =
  | { deduped: true; eventId?: undefined }
  | { deduped: false; eventId: number };

export function recordWebhookEvent(db: Database.Database, input: RecordWebhookEventInput): RecordWebhookEventResult;
export function mergeWebhookIntent(db: Database.Database, input: MergeWebhookIntentInput): number;
export function claimDueWebhookIntent(db: Database.Database, now: number, leaseMs: number): WebhookIntent | undefined;
export function recoverExpiredWebhookIntentLeases(db: Database.Database, now: number): number;
export function expireOldWebhookIntents(db: Database.Database, now: number, maxAgeMs: number): number;
export function listWebhookEvents(db: Database.Database, limit?: number): WebhookEvent[];
```

Implementation details:

- `recordWebhookEvent` inserts `webhook_deliveries` first.
- On `SQLITE_CONSTRAINT_PRIMARYKEY` or `SQLITE_CONSTRAINT_UNIQUE` for duplicate delivery, return `{ deduped: true }`.
- `mergeWebhookIntent` finds an active row by repo/target/status and updates it, or inserts a new pending row.
- Use a DB transaction for event+intent updates when both are needed.

- [ ] **Step 4: Export helpers**

In `packages/core/src/index.ts`, export:

```ts
export {
  recordWebhookEvent,
  mergeWebhookIntent,
  claimDueWebhookIntent,
  recoverExpiredWebhookIntentLeases,
  expireOldWebhookIntents,
  listWebhookEvents,
} from "./db/webhooks.js";
export type {
  RecordWebhookEventInput,
  RecordWebhookEventResult,
} from "./db/webhooks.js";
```

- [ ] **Step 5: Run tests**

```bash
pnpm --dir packages/core test -- webhooks
pnpm --dir packages/core typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/db/webhooks.ts packages/core/src/db/webhooks.test.ts packages/core/src/index.ts
git commit -m "feat: add webhook db helpers"
```

### Task 5: Add Server-Level Webhook Handler

**Files:**
- Create: `packages/web/lib/github-webhook-handler.ts`
- Create: `packages/web/lib/github-webhook-handler.test.ts`

- [ ] **Step 1: Write handler tests**

Create tests covering:

```ts
it("rejects non-POST requests with 405");
it("rejects missing signatures with 401");
it("rejects invalid signatures with 401");
it("rejects oversized bodies with 413");
it("rejects payloads whose repository does not match the route repo");
it("dedupes repeated delivery ids");
it("records metadata-only events by default");
it("creates an intent for issues opened");
```

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm --dir packages/web test -- github-webhook-handler
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement handler module**

Create `packages/web/lib/github-webhook-handler.ts` with:

```ts
export const GITHUB_WEBHOOK_PATH_RE = /^\\/api\\/webhook\\/github\\/(\\d+)$/;
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

export function isGithubWebhookRequest(url: string | undefined): boolean {
  return GITHUB_WEBHOOK_PATH_RE.test(new URL(url ?? "/", "http://localhost").pathname);
}

export async function handleGithubWebhookRequest(
  db: Database.Database,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  // Return false when the route does not match, true when handled.
}
```

Handler requirements:

- Parse `repo_id` from path.
- Check method is POST.
- Read raw body with `MAX_WEBHOOK_BODY_BYTES`.
- Fetch repo with `getRepoById`.
- Require `repo.webhookSecret`.
- Verify `X-Hub-Signature-256` with `crypto.createHmac` and `timingSafeEqual`.
- Parse JSON only after HMAC passes.
- Verify `payload.repository.full_name === `${repo.owner}/${repo.name}``.
- Require bounded `X-GitHub-Delivery`.
- Record event with `recordWebhookEvent`.
- Merge intent only for Phase 1 gating-relevant issue/PR events.
- Respond with JSON.

- [ ] **Step 4: Add event classifier**

In the same file, add:

```ts
export function classifyWebhookTarget(payload: unknown): {
  targetType: WebhookTargetType | null;
  targetNumber: number | null;
  desiredHeadSha: string | null;
};
```

Rules:

- `issues` payloads use `payload.issue.number`; if `payload.issue.pull_request` exists, classify as `pr`.
- `pull_request` payloads use `payload.pull_request.number` and `payload.pull_request.head.sha`.
- Unsupported payloads return null target.

- [ ] **Step 5: Run handler tests**

```bash
pnpm --dir packages/web test -- github-webhook-handler
pnpm --dir packages/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/lib/github-webhook-handler.ts packages/web/lib/github-webhook-handler.test.ts
git commit -m "feat: add github webhook receiver"
```

### Task 6: Wire Handler Into Custom Server

**Files:**
- Modify: `packages/web/server.ts`
- Test: `packages/web/lib/github-webhook-handler.test.ts`

- [ ] **Step 1: Add dependency imports**

In `packages/web/server.ts`, import:

```ts
import { getDb } from "@issuectl/core";
import { handleGithubWebhookRequest } from "./lib/github-webhook-handler";
```

If the core DB accessor has a different exported name, use the existing pattern from server-side actions.

- [ ] **Step 2: Route before LAN redirect and Next handler**

Inside `createServer((req, res) => { ... })`, after `logRequest(req, res);`, add:

```ts
  handleGithubWebhookRequest(getDb(), req, res)
    .then((handled) => {
      if (handled) return;
      handleDashboardRequest(req, res);
    })
    .catch((err) => {
      log.error({ err, msg: "github_webhook_handler_error" });
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Internal Server Error" }));
    });
```

Then extract the current LAN redirect + `handle(req, res)` logic into:

```ts
function handleDashboardRequest(req: IncomingMessage, res: ServerResponse): void {
  // existing LAN redirect and Next handler logic
}
```

- [ ] **Step 3: Run server typecheck**

```bash
pnpm --dir packages/web typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/web/server.ts
git commit -m "feat: route github webhooks before next"
```

### Task 7: Add Intent Worker Helpers

**Files:**
- Create: `packages/web/lib/webhook-intent-worker.ts`
- Create: `packages/web/lib/webhook-intent-worker.test.ts`

- [ ] **Step 1: Write worker tests**

Create tests for:

```ts
it("claims due pending intents with a lease");
it("does not claim future scheduled intents");
it("recovers expired processing leases to pending");
it("expires active intents beyond max age");
it("does not launch agents in phase 1");
```

- [ ] **Step 2: Implement worker**

Create `packages/web/lib/webhook-intent-worker.ts`:

```ts
export function runWebhookIntentWorkerOnce(db: Database.Database, now = Date.now()): {
  claimed: number;
  recovered: number;
  expired: number;
} {
  const recovered = recoverExpiredWebhookIntentLeases(db, now);
  const maxAgeMinutes = Number(getSetting(db, "max_webhook_intent_age_minutes") ?? "60");
  const expired = expireOldWebhookIntents(db, now, maxAgeMinutes * 60_000);
  const intent = claimDueWebhookIntent(db, now, 60_000);
  if (!intent) return { claimed: 0, recovered, expired };

  // Phase 1 intentionally stops before launch integration.
  return { claimed: 1, recovered, expired };
}
```

Do not start this worker in `server.ts` yet unless the tests and diagnostics are ready. Phase 1 can expose the function and wire periodic startup in a follow-up after receiver tests pass.

- [ ] **Step 3: Run tests**

```bash
pnpm --dir packages/web test -- webhook-intent-worker
pnpm --dir packages/web typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/web/lib/webhook-intent-worker.ts packages/web/lib/webhook-intent-worker.test.ts
git commit -m "feat: add webhook intent worker foundation"
```

### Task 8: Add CLI Webhook Visibility

**Files:**
- Create: `packages/cli/src/commands/webhook.ts`
- Create: `packages/cli/src/commands/webhook.test.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Implement command registration**

Create `packages/cli/src/commands/webhook.ts`:

```ts
import { Command } from "commander";
import { getDb, listWebhookEvents, listRepos } from "@issuectl/core";

export function registerWebhookCommands(program: Command): void {
  const webhook = program.command("webhook").description("Inspect GitHub webhook receiver state");

  webhook
    .command("tail")
    .description("Show recent webhook events")
    .option("--limit <n>", "Number of events to show", "20")
    .action((opts) => {
      const db = getDb();
      const limit = Number(opts.limit ?? "20");
      const events = listWebhookEvents(db, limit);
      for (const event of events) {
        console.log(`${event.id}\\t${event.eventType}\\t${event.action ?? "-"}\\t${event.targetType ?? "-"}#${event.targetNumber ?? "-"}`);
      }
    });

  webhook
    .command("status")
    .description("Show webhook configuration for tracked repos")
    .action(() => {
      const db = getDb();
      for (const repo of listRepos(db)) {
        console.log(`${repo.owner}/${repo.name}\\tauto_launch=${repo.autoLaunchIssues}\\tauto_review=${repo.autoReviewPrs}\\tpayload=${repo.webhookPayloadMode}\\tsecret=${repo.webhookSecret ? "set" : "missing"}`);
      }
    });
}
```

- [ ] **Step 2: Register command**

In `packages/cli/src/index.ts`, import and call:

```ts
import { registerWebhookCommands } from "./commands/webhook.js";
```

Then near `registerDiagCommands(program);`:

```ts
registerWebhookCommands(program);
```

- [ ] **Step 3: Add CLI tests**

In `packages/cli/src/commands/webhook.test.ts`, test that:

- `webhook status` prints `secret=set` or `secret=missing`, never the secret value.
- `webhook tail --limit 1` prints the newest webhook event.

- [ ] **Step 4: Run tests**

```bash
pnpm --dir packages/cli test -- webhook
pnpm --dir packages/cli typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/webhook.ts packages/cli/src/commands/webhook.test.ts packages/cli/src/index.ts
git commit -m "feat: add webhook inspection cli"
```

### Task 9: Add Phase 1 Documentation

**Files:**
- Create: `docs/specs/2026-05-23-webhooks-design.md`

- [ ] **Step 1: Create docs**

Create `docs/specs/2026-05-23-webhooks-design.md` with:

```md
# GitHub Webhook Receiver Foundation

Phase 1 installs a local GitHub webhook receiver in `issuectl web`.

## Endpoint

`POST /api/webhook/github/:repo_id`

The route is handled by the custom Node server before Next.js so the receiver can verify the raw request body.

## Tunnel Examples

```bash
cloudflared tunnel --url http://localhost:3847
ngrok http 3847
tailscale funnel 3847
```

## Security Invariants

- HMAC verification happens before JSON parsing and before any DB write.
- `X-GitHub-Delivery` is required and deduped.
- Signed payload repository identity must match the configured repo.
- Raw payloads are metadata-only by default.
- `webhook_secret` is never printed by CLI status, diagnostics, or logs.

## CLI

```bash
issuectl webhook status
issuectl webhook tail --limit 20
```

## Out of Scope

- Launching agents from intents.
- PR review sessions.
- Direct pushes.
- Comment commands.
- Completion notifications.
```

- [ ] **Step 2: Commit**

```bash
git add docs/specs/2026-05-23-webhooks-design.md
git commit -m "docs: add webhook receiver foundation notes"
```

### Task 10: Integration Verification

**Files:**
- No planned edits unless tests expose integration bugs.

- [ ] **Step 1: Run focused package checks**

```bash
pnpm --dir packages/core test
pnpm --dir packages/web test
pnpm --dir packages/cli test
pnpm --dir packages/core typecheck
pnpm --dir packages/web typecheck
pnpm --dir packages/cli typecheck
```

Expected: PASS.

- [ ] **Step 2: Run lint for touched packages**

```bash
pnpm --dir packages/core lint
pnpm --dir packages/web lint
pnpm --dir packages/cli lint
```

Expected: PASS.

- [ ] **Step 3: Manual receiver smoke test**

Start the web server:

```bash
pnpm --dir packages/web dev
```

In another terminal, send an unsigned payload:

```bash
curl -i -X POST http://localhost:3847/api/webhook/github/1 -d '{}'
```

Expected: `401` JSON response, and no raw payload/secret in `~/.issuectl/logs/web.log`.

- [ ] **Step 4: Review git diff**

```bash
git status --short
git diff --stat
git diff --check
```

Expected: no whitespace errors, only Phase 1 files touched.

## Self-Review

Spec coverage:

- Receiver route, HMAC, body limits, repo binding, replay dedup: Tasks 5-6.
- Delivery tombstones, event metadata, intent state: Tasks 2 and 4.
- Repo flags, payload mode, settings defaults: Tasks 2-3.
- Worker lease/recovery foundation: Task 7.
- CLI visibility: Task 8.
- Tunnel/security docs: Task 9.
- Launching, PR review, direct push, completion, notifications: intentionally deferred.

Placeholder scan:

- No unresolved placeholders or unspecified implementation steps remain for Phase 1.
- Any worker executing this plan should still inspect nearby local patterns before editing.

Type consistency:

- Shared type names are defined in Task 1 and reused by later tasks.
- DB helper names are defined in Task 4 and reused by Tasks 5, 7, and 8.
