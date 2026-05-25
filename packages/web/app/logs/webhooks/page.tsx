/* eslint-disable max-lines */
import Link from "next/link";
import {
  dbExists,
  getDb,
  listRepos,
  listWebhookLogEntries,
  queryDiagnosticEvents,
  type DiagnosticEvent,
  type Repo,
  type WebhookLogEntry,
  type WebhookLogResult,
} from "@issuectl/core";
import { PageHeader } from "@/components/ui/PageHeader";
import { WebhookLiveTail } from "./WebhookLiveTail";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Webhook logs - issuectl" };

type SearchParams = {
  repo?: string;
  delivery?: string;
  result?: string;
  event?: string;
  q?: string;
};

type AuditFilter = "all" | "valid" | "invalid" | "replay";

const RESULT_FILTERS: Array<{ label: string; value: WebhookLogResult | "all" }> = [
  { label: "All", value: "all" },
  { label: "Fired", value: "fired" },
  { label: "Debouncing", value: "debouncing" },
  { label: "Processing", value: "processing" },
  { label: "Gated", value: "gated" },
  { label: "Dropped", value: "dropped" },
  { label: "Failed", value: "failed" },
  { label: "Received", value: "received" },
];

const AUDIT_FILTERS: Array<{ label: string; value: AuditFilter }> = [
  { label: "Valid", value: "valid" },
  { label: "Invalid", value: "invalid" },
  { label: "Replay", value: "replay" },
];

const AUDIT_EVENTS = ["webhook.invalid_signature", "webhook.deduped"];

export default async function WebhookLogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  if (!dbExists()) {
    return (
      <>
        <PageHeader title="Webhook logs" breadcrumb={<Link href="/settings">settings</Link>} />
        <main className={styles.shell}>
          <section className={styles.emptyState}>
            <p>Run <code>issuectl init</code> to create the local database.</p>
          </section>
        </main>
      </>
    );
  }

  const db = getDb();
  const repos = listRepos(db);
  const selectedRepoId = parsePositiveInt(params.repo);
  const selectedRepo = repos.find((repo) => repo.id === selectedRepoId);
  const entries = filterEntries(
    listWebhookLogEntries(db, {
      limit: 200,
      ...(selectedRepo ? { repoId: selectedRepo.id } : {}),
    }),
    params,
    repos,
  );
  const auditEvents = filterAuditEvents(
    queryDiagnosticEvents(db, { events: AUDIT_EVENTS, limit: 30 }),
    params,
    repos,
  );
  const auditFilter = activeAuditFilter(params.result);
  const metrics = summarize(entries);
  const health = webhookHealth(entries);

  return (
    <>
      <PageHeader title="Webhook logs" breadcrumb={<Link href="/">dashboard</Link>} />
      <main className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Operator log</p>
            <h1 className={styles.title}>GitHub webhook events</h1>
            <p className={styles.subtitle}>
              Read-only delivery, debounce, action, and diagnostic trail for webhook automation.
            </p>
          </div>
          <span className={styles.statusPill} data-tone={health.tone}>
            {health.label}
          </span>
        </section>

        <dl className={styles.healthStrip} aria-label="Webhook receiver summary">
          <Metric label="Today" value={`${metrics.today} deliveries`} />
          <Metric label="Actions" value={`${metrics.fired} fired`} />
          <Metric label="Dropped" value={`${metrics.dropped + metrics.gated} gated/drop`} />
          <Metric label="Audit" value={`${auditEvents.length} invalid/replay`} />
          <Metric label="Raw payloads" value={`${metrics.retained} retained`} />
          <Metric label="Stream" value="/api/webhooks/events/stream" />
        </dl>
        <WebhookLiveTail
          endpoint="/api/webhooks/events/stream"
          initialEntries={entries.slice(0, 50)}
          initialCounts={summarizeStreamCounts(entries.slice(0, 50))}
        />

        <form className={styles.toolbar} action="/logs/webhooks">
          <div className={styles.filters} aria-label="Webhook result filters">
            {RESULT_FILTERS.map((filter) => (
              <Link
                key={filter.value}
                className={styles.chip}
                data-active={auditFilter === "all" && activeResult(params.result) === filter.value}
                href={hrefFor(params, {
                  result: filter.value === "all" ? undefined : filter.value,
                })}
              >
                {filter.label}
              </Link>
            ))}
            {AUDIT_FILTERS.map((filter) => (
              <Link
                key={filter.value}
                className={styles.chip}
                data-active={auditFilter === filter.value}
                href={hrefForAudit(params, filter.value)}
              >
                {filter.label}
              </Link>
            ))}
          </div>
          <div className={styles.searchRow}>
            <input
              className={styles.input}
              type="search"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="delivery, correlation, owner/repo#507"
              aria-label="Search webhook logs"
            />
            <input
              className={styles.input}
              type="search"
              name="event"
              defaultValue={params.event ?? ""}
              placeholder="issues, pull_request, labeled"
              aria-label="Filter by event"
            />
            <select className={styles.select} name="repo" defaultValue={selectedRepo?.id ?? ""} aria-label="Filter by repo">
              <option value="">All repos</option>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.id}>{repo.owner}/{repo.name}</option>
              ))}
            </select>
            <button className={styles.button} type="submit">Apply</button>
          </div>
          {params.result && <input type="hidden" name="result" value={params.result} />}
          {params.delivery && <input type="hidden" name="delivery" value={params.delivery} />}
        </form>

        {entries.length === 0 ? (
          <section className={styles.emptyState}>
            <h2>No webhook events match these filters.</h2>
            <p className={styles.muted}>Use `issuectl webhook tail` to mirror this timeline in the terminal.</p>
          </section>
        ) : (
          <WebhookTable entries={entries} repos={repos} />
        )}
        <WebhookAuditPanel events={auditEvents} />
      </main>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metric}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function WebhookTable({ entries, repos }: { entries: WebhookLogEntry[]; repos: Repo[] }) {
  return (
    <section className={styles.tableWrap} aria-label="Webhook event timeline">
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Time</th>
            <th>Delivery</th>
            <th>Repo</th>
            <th>Event</th>
            <th>Intent</th>
            <th>Action</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <WebhookRow key={entry.id} entry={entry} repo={repos.find((item) => item.id === entry.repoId)} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function WebhookAuditPanel({ events }: { events: DiagnosticEvent[] }) {
  return (
    <section className={styles.auditPanel} aria-label="Webhook invalid and replay audit">
      <div className={styles.auditHeader}>
        <div>
          <h2>Invalid and replay audit</h2>
          <p className={styles.muted}>Metadata-only diagnostics for rejected signatures and duplicate deliveries.</p>
        </div>
        <div className={styles.filters}>
          <Link className={styles.chip} href="/logs/webhooks?event=webhook.invalid_signature">Invalid</Link>
          <Link className={styles.chip} href="/logs/webhooks?event=webhook.deduped">Replay</Link>
        </div>
      </div>
      {events.length === 0 ? (
        <p className={styles.muted}>No invalid signature or replay diagnostics match these filters.</p>
      ) : (
        <div className={styles.auditList}>
          {events.map((event) => (
            <article key={event.id} className={styles.auditItem}>
              <strong>{event.event === "webhook.deduped" ? "replayed delivery" : "invalid signature"}</strong>
              <span>{event.owner}/{event.repo} · {event.correlationId ?? "unknown delivery"} · {formatAge(event.timestamp)}</span>
              <code>{auditCliHint(event)}</code>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function WebhookRow({ entry, repo }: { entry: WebhookLogEntry; repo: Repo | undefined }) {
  const target = targetLabel(entry);
  const command = diagnosticsCommand(entry, repo);
  return (
    <>
      <tr>
        <td>{formatAge(entry.receivedAt)}</td>
        <td>
          <div className={styles.rowSummary}>
            <span className={styles.delivery}>{shortId(entry.deliveryId)}</span>
            <span className={styles.muted}>{entry.senderLogin ?? "GitHub"}</span>
          </div>
        </td>
        <td>{repo ? `${repo.owner}/${repo.name}` : `repo ${entry.repoId}`}</td>
        <td>{entry.eventType}{entry.action ? `.${entry.action}` : ""}</td>
        <td>{entry.intent ? `int_${entry.intent.id}` : "-"}</td>
        <td>{entry.actionId ?? "-"}</td>
        <td>
          <span className={styles.result} data-result={entry.result}>{entry.result}</span>
        </td>
      </tr>
      <tr>
        <td className={styles.detailsCell} colSpan={7}>
          <details className={styles.details}>
            <summary>Details for {target}</summary>
            <div className={styles.detailGrid}>
              <DetailBlock title="Headers">
                <span className={styles.code}>X-GitHub-Delivery: {entry.deliveryId}</span>
                <span className={styles.code}>Event: {entry.eventType}</span>
                <span className={styles.code}>Sender: {entry.senderLogin ?? "unknown"}</span>
                <span className={styles.code}>Received: {new Date(entry.receivedAt).toLocaleString()}</span>
              </DetailBlock>
              <DetailBlock title="Chain">
                <span className={styles.code}>Target: {target}</span>
                <span className={styles.code}>Intent: {entry.intent ? `int_${entry.intent.id}` : "none"}</span>
                <span className={styles.code}>Result: {entry.resultDetail ?? entry.result}</span>
                <span className={styles.code}>CLI hint: {cliHint(entry)}</span>
              </DetailBlock>
              <DetailBlock title="Diagnostics">
                <span className={styles.code}>{command}</span>
              </DetailBlock>
              <DetailBlock title="Raw payload">
                {entry.payloadJson ? (
                  entry.payloadJson.length > 100_000 ? (
                    <span className={styles.code}>payload: {entry.payloadJson.length} bytes; use CLI export for full payload</span>
                  ) : (
                    <pre className={styles.payload}>{formatPayload(entry.payloadJson)}</pre>
                  )
                ) : (
                  <span className={styles.muted}>No raw payload retained.</span>
                )}
              </DetailBlock>
            </div>
          </details>
        </td>
      </tr>
    </>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.detailBlock}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function filterEntries(
  entries: WebhookLogEntry[],
  params: SearchParams,
  repos: Repo[],
): WebhookLogEntry[] {
  const result = activeResult(params.result);
  const query = params.q?.trim().toLowerCase();
  const eventQuery = params.event?.trim().toLowerCase();
  const deliveryQuery = params.delivery?.trim();
  return entries.filter((entry) => {
    if (deliveryQuery && entry.deliveryId !== deliveryQuery) return false;
    if (result !== "all" && entry.result !== result) return false;
    const eventText = `${entry.eventType} ${entry.action ?? ""}`.toLowerCase();
    if (eventQuery && !eventText.includes(eventQuery)) return false;
    if (!query) return true;
    const repo = repos.find((item) => item.id === entry.repoId);
    const haystack = [
      entry.deliveryId,
      entry.eventType,
      entry.action,
      entry.senderLogin,
      entry.targetNumber ? `${repo?.owner}/${repo?.name}#${entry.targetNumber}` : null,
      entry.intent ? `int_${entry.intent.id}` : null,
      entry.actionId,
      entry.resultDetail,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

function filterAuditEvents(
  events: DiagnosticEvent[],
  params: SearchParams,
  repos: Repo[],
): DiagnosticEvent[] {
  const query = params.q?.trim().toLowerCase();
  const eventQuery = params.event?.trim().toLowerCase();
  const deliveryQuery = params.delivery?.trim().toLowerCase();
  const auditFilter = activeAuditFilter(params.result);
  const selectedRepoId = parsePositiveInt(params.repo);
  const selectedRepo = repos.find((repo) => repo.id === selectedRepoId);
  return events.filter((event) => {
    if (selectedRepo && (event.owner !== selectedRepo.owner || event.repo !== selectedRepo.name)) return false;
    if (auditFilter === "invalid" && event.event !== "webhook.invalid_signature") return false;
    if (auditFilter === "replay" && event.event !== "webhook.deduped") return false;
    if (auditFilter === "valid") return false;
    if (eventQuery && !event.event.toLowerCase().includes(eventQuery)) return false;
    if (deliveryQuery && event.correlationId?.toLowerCase() !== deliveryQuery) return false;
    if (!query) return true;
    return [
      event.event,
      event.correlationId,
      event.owner && event.repo ? `${event.owner}/${event.repo}` : null,
      event.targetNumber ? `${event.owner}/${event.repo}#${event.targetNumber}` : null,
      event.message,
    ].filter(Boolean).join(" ").toLowerCase().includes(query);
  });
}

function summarize(entries: WebhookLogEntry[]) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return {
    today: entries.filter((entry) => entry.receivedAt >= todayStart.getTime()).length,
    fired: entries.filter((entry) => entry.result === "fired").length,
    dropped: entries.filter((entry) => entry.result === "dropped" || entry.result === "failed").length,
    gated: entries.filter((entry) => entry.result === "gated").length,
    retained: entries.filter((entry) => entry.payloadJson).length,
  };
}

function summarizeStreamCounts(entries: WebhookLogEntry[]): Record<string, number> {
  return {
    total: entries.length,
    fired: entries.filter((entry) => entry.result === "fired").length,
    debouncing: entries.filter((entry) => entry.result === "debouncing").length,
    processing: entries.filter((entry) => entry.result === "processing").length,
    gated: entries.filter((entry) => entry.result === "gated").length,
    dropped: entries.filter((entry) => entry.result === "dropped").length,
    failed: entries.filter((entry) => entry.result === "failed").length,
    received: entries.filter((entry) => entry.result === "received").length,
  };
}

function webhookHealth(entries: WebhookLogEntry[]): { label: string; tone: "green" | "amber" | "red" } {
  const last = entries[0]?.receivedAt;
  if (!last) return { label: "No deliveries", tone: "red" };
  const ageMs = Date.now() - last;
  if (ageMs < 5 * 60 * 1000) return { label: "Healthy", tone: "green" };
  if (ageMs < 60 * 60 * 1000) return { label: "Quiet", tone: "amber" };
  return { label: "Stale", tone: "red" };
}

function activeResult(value: string | undefined): WebhookLogResult | "all" {
  return RESULT_FILTERS.some((filter) => filter.value === value) ? value as WebhookLogResult : "all";
}

function activeAuditFilter(value: string | undefined): AuditFilter {
  return AUDIT_FILTERS.some((filter) => filter.value === value) ? value as AuditFilter : "all";
}

function hrefFor(params: SearchParams, next: Partial<SearchParams>): string {
  const search = new URLSearchParams();
  const merged = { ...params, ...next };
  for (const [key, value] of Object.entries(merged)) {
    if (value) search.set(key, value);
  }
  return `/logs/webhooks${search.size > 0 ? `?${search.toString()}` : ""}`;
}

function hrefForAudit(params: SearchParams, value: AuditFilter): string {
  return hrefFor(params, { result: value === "all" ? undefined : value, event: undefined });
}

function parsePositiveInt(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function targetLabel(entry: WebhookLogEntry): string {
  if (!entry.targetType || !entry.targetNumber) return "repo event";
  return `${entry.targetType === "pr" ? "PR" : "issue"} #${entry.targetNumber}`;
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 10)}...` : value;
}

function formatAge(value: number): string {
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 48) return `${deltaHours}h ago`;
  return new Date(value).toLocaleDateString();
}

function diagnosticsCommand(entry: WebhookLogEntry, repo: Repo | undefined): string {
  if (entry.targetType && entry.targetNumber && repo) {
    const targetFlag = entry.targetType === "pr" ? "--pr" : "--issue";
    return `pnpm --dir packages/cli exec issuectl diag show ${targetFlag} ${repo.owner}/${repo.name}#${entry.targetNumber}`;
  }
  return "pnpm --dir packages/cli exec issuectl webhook tail --limit 20";
}

function cliHint(entry: WebhookLogEntry): string {
  if (entry.targetType && entry.targetNumber) {
    return `issuectl webhook tail --target ${entry.targetType}#${entry.targetNumber} --limit 20`;
  }
  if (entry.result === "dropped" || entry.result === "failed") {
    return "issuectl diag list --event webhook.runaway_limited webhook.launch_failed --limit 50";
  }
  return "issuectl webhook tail";
}

function auditCliHint(event: DiagnosticEvent): string {
  if (event.targetType && event.targetNumber && event.owner && event.repo) {
    const targetFlag = event.targetType === "pr" ? "--pr" : "--issue";
    return `pnpm --dir packages/cli exec issuectl diag show ${targetFlag} ${event.owner}/${event.repo}#${event.targetNumber}`;
  }
  if (event.correlationId) {
    return `pnpm --dir packages/cli exec issuectl diag list --correlation ${event.correlationId}`;
  }
  return `pnpm --dir packages/cli exec issuectl diag list --event ${event.event}`;
}

function formatPayload(payload: string): string {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}
