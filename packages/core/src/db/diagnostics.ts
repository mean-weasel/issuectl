import type Database from "better-sqlite3";

export type DiagnosticLevel = "debug" | "info" | "warn" | "error";

export type DiagnosticEventInput = {
  timestamp?: number;
  level: DiagnosticLevel;
  event: string;
  source: string;
  correlationId?: string;
  owner?: string;
  repo?: string;
  issueNumber?: number;
  deploymentId?: number;
  sessionName?: string;
  ttydPort?: number;
  ttydPid?: number;
  status?: string;
  message?: string;
  data?: Record<string, unknown> | null;
};

export type DiagnosticEvent = {
  id: number;
  timestamp: number;
  level: DiagnosticLevel;
  event: string;
  source: string;
  correlationId: string | null;
  owner: string | null;
  repo: string | null;
  issueNumber: number | null;
  deploymentId: number | null;
  sessionName: string | null;
  ttydPort: number | null;
  ttydPid: number | null;
  status: string | null;
  message: string | null;
  data: Record<string, unknown> | null;
};

export type DiagnosticIssueFilter = {
  owner: string;
  repo: string;
  issueNumber: number;
};

export type DiagnosticQuery = {
  since?: number;
  until?: number;
  issue?: DiagnosticIssueFilter;
  deploymentId?: number;
  correlationId?: string;
  events?: string[];
  levels?: DiagnosticLevel[];
  limit?: number;
};

type DiagnosticEventRow = {
  id: number;
  ts: number;
  level: string;
  event: string;
  source: string;
  correlation_id: string | null;
  owner: string | null;
  repo: string | null;
  issue_number: number | null;
  deployment_id: number | null;
  session_name: string | null;
  ttyd_port: number | null;
  ttyd_pid: number | null;
  status: string | null;
  message: string | null;
  data_json: string | null;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

export function recordDiagnosticEvent(
  db: Database.Database,
  input: DiagnosticEventInput,
): number {
  const result = db
    .prepare(
      `INSERT INTO diagnostic_events (
        ts, level, event, source, correlation_id, owner, repo, issue_number,
        deployment_id, session_name, ttyd_port, ttyd_pid, status, message,
        data_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.timestamp ?? Date.now(),
      input.level,
      input.event,
      input.source,
      input.correlationId ?? null,
      input.owner ?? null,
      input.repo ?? null,
      input.issueNumber ?? null,
      input.deploymentId ?? null,
      input.sessionName ?? null,
      input.ttydPort ?? null,
      input.ttydPid ?? null,
      input.status ?? null,
      input.message ?? null,
      input.data === undefined || input.data === null
        ? null
        : JSON.stringify(input.data),
    );

  return Number(result.lastInsertRowid);
}

export function recordDiagnosticEventSafely(
  db: Database.Database,
  input: DiagnosticEventInput,
): number | undefined {
  try {
    return recordDiagnosticEvent(db, input);
  } catch (err) {
    console.warn("[issuectl] Failed to record diagnostic event:", err);
    return undefined;
  }
}

export function queryDiagnosticEvents(
  db: Database.Database,
  query: DiagnosticQuery = {},
): DiagnosticEvent[] {
  return selectDiagnosticEvents(db, query, "DESC");
}

export function getDiagnosticTimeline(
  db: Database.Database,
  query: DiagnosticQuery = {},
): DiagnosticEvent[] {
  return selectDiagnosticEvents(db, query, "ASC");
}

function selectDiagnosticEvents(
  db: Database.Database,
  query: DiagnosticQuery,
  order: "ASC" | "DESC",
): DiagnosticEvent[] {
  const params: unknown[] = [];
  const where: string[] = [];

  if (query.since !== undefined) {
    where.push("ts >= ?");
    params.push(query.since);
  }
  if (query.until !== undefined) {
    where.push("ts <= ?");
    params.push(query.until);
  }
  if (query.issue) {
    where.push("owner = ?", "repo = ?", "issue_number = ?");
    params.push(query.issue.owner, query.issue.repo, query.issue.issueNumber);
  }
  if (query.deploymentId !== undefined) {
    where.push("deployment_id = ?");
    params.push(query.deploymentId);
  }
  if (query.correlationId !== undefined) {
    where.push("correlation_id = ?");
    params.push(query.correlationId);
  }
  if (query.events && query.events.length > 0) {
    where.push(`event IN (${placeholders(query.events.length)})`);
    params.push(...query.events);
  }
  if (query.levels && query.levels.length > 0) {
    where.push(`level IN (${placeholders(query.levels.length)})`);
    params.push(...query.levels);
  }

  const limit = clampLimit(query.limit);
  params.push(limit);

  const sql = [
    "SELECT * FROM diagnostic_events",
    where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    `ORDER BY ts ${order}, id ${order}`,
    "LIMIT ?",
  ]
    .filter(Boolean)
    .join(" ");

  const rows = db.prepare(sql).all(...params) as DiagnosticEventRow[];
  return rows.map(rowToDiagnosticEvent);
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit)));
}

function rowToDiagnosticEvent(row: DiagnosticEventRow): DiagnosticEvent {
  return {
    id: row.id,
    timestamp: row.ts,
    level: row.level as DiagnosticLevel,
    event: row.event,
    source: row.source,
    correlationId: row.correlation_id,
    owner: row.owner,
    repo: row.repo,
    issueNumber: row.issue_number,
    deploymentId: row.deployment_id,
    sessionName: row.session_name,
    ttydPort: row.ttyd_port,
    ttydPid: row.ttyd_pid,
    status: row.status,
    message: row.message,
    data: parseData(row.data_json),
  };
}

function parseData(dataJson: string | null): Record<string, unknown> | null {
  if (dataJson === null) return null;
  return JSON.parse(dataJson) as Record<string, unknown>;
}
