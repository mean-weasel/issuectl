import { Command } from "commander";
import {
  getDiagnosticTimeline,
  queryDiagnosticEvents,
  type DiagnosticEvent,
  type DiagnosticIssueFilter,
  type DiagnosticLevel,
  type DiagnosticQuery,
} from "@issuectl/core";
import { summarizeBackends, type BackendSummary } from "./diag-summary.js";
import { requireDb } from "../utils/db.js";

type CommonOptions = {
  issue?: string;
  deployment?: string;
  event?: string[];
  level?: string[];
  correlation?: string;
  limit?: string;
  json?: boolean;
};

type TailOptions = CommonOptions & {
  since: string;
};

type ListOptions = CommonOptions & {
  since?: string;
  until?: string;
};

type ShowOptions = {
  deployment?: string;
  issue?: string;
  correlation?: string;
  limit?: string;
  json?: boolean;
};

type SummaryOptions = {
  since?: string;
  issue?: string;
  limit?: string;
  json?: boolean;
};

const VALID_LEVELS = new Set<DiagnosticLevel>(["debug", "info", "warn", "error"]);
const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/;

export function registerDiagCommands(program: Command): void {
  const diag = program
    .command("diag")
    .description("Query local diagnostics events");

  diag
    .command("tail")
    .description("Show recent diagnostics events")
    .option("--since <duration>", "Relative duration to query, e.g. 15m, 2h, 1d", "15m")
    .option("--issue <owner/repo#number>", "Filter by issue")
    .option("--deployment <id>", "Filter by deployment id")
    .option("--event <name...>", "Filter by event name")
    .option("--level <level...>", "Filter by level: debug, info, warn, error")
    .option("--correlation <id>", "Filter by correlation id")
    .option("--limit <count>", "Maximum rows to return", "100")
    .option("--json", "Print JSON")
    .action((options: TailOptions, command: Command) => {
      const query = parseCommandInput(command, () =>
        buildQuery(options, {
          since: Date.now() - parseDurationMs(options.since),
        }),
      );
      printEvents(queryDiagnosticEvents(requireDb(), query), Boolean(options.json));
    });

  diag
    .command("list")
    .description("List diagnostics events")
    .option("--since <duration>", "Relative duration to query, e.g. 15m, 2h, 1d")
    .option("--until <iso>", "Upper bound ISO timestamp")
    .option("--issue <owner/repo#number>", "Filter by issue")
    .option("--deployment <id>", "Filter by deployment id")
    .option("--event <name...>", "Filter by event name")
    .option("--level <level...>", "Filter by level: debug, info, warn, error")
    .option("--correlation <id>", "Filter by correlation id")
    .option("--limit <count>", "Maximum rows to return", "100")
    .option("--json", "Print JSON")
    .action((options: ListOptions, command: Command) => {
      const query = parseCommandInput(command, () =>
        buildQuery(options, {
          since: options.since ? Date.now() - parseDurationMs(options.since) : undefined,
          until: options.until ? parseIsoTimestamp(options.until, "--until") : undefined,
        }),
      );
      printEvents(queryDiagnosticEvents(requireDb(), query), Boolean(options.json));
    });

  diag
    .command("show")
    .description("Show a chronological diagnostics timeline")
    .option("--deployment <id>", "Filter by deployment id")
    .option("--issue <owner/repo#number>", "Filter by issue")
    .option("--correlation <id>", "Filter by correlation id")
    .option("--limit <count>", "Maximum rows to return", "200")
    .option("--json", "Print JSON")
    .action((options: ShowOptions, command: Command) => {
      const query = parseCommandInput(command, () => buildQuery(options));
      printEvents(getDiagnosticTimeline(requireDb(), query), Boolean(options.json));
    });

  diag
    .command("summary")
    .description("Summarize diagnostics by terminal backend")
    .option("--since <duration>", "Relative duration to query, e.g. 15m, 2h, 1d", "1d")
    .option("--issue <owner/repo#number>", "Filter by issue")
    .option("--limit <count>", "Maximum rows to summarize", "1000")
    .option("--json", "Print JSON")
    .action((options: SummaryOptions, command: Command) => {
      const db = requireDb();
      const query = parseCommandInput(command, () =>
        buildQuery(options, {
          since: options.since ? Date.now() - parseDurationMs(options.since) : undefined,
        }),
      );
      printBackendSummary(summarizeBackends(queryDiagnosticEvents(db, query), db), Boolean(options.json));
    });
}

export function parseDurationMs(value: string): number {
  const match = /^([1-9]\d*)([mhd])$/.exec(value.trim());
  if (!match) {
    throw new Error("Invalid duration. Use a positive integer followed by m, h, or d, e.g. 15m.");
  }

  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}

export function parseIssueRef(value: string): DiagnosticIssueFilter {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#([1-9]\d*)$/.exec(value.trim());
  if (!match) {
    throw new Error("Invalid issue ref. Use owner/repo#number, e.g. mean-weasel/issuectl-test-repo#152.");
  }

  return {
    owner: match[1],
    repo: match[2],
    issueNumber: Number(match[3]),
  };
}

export function formatDiagnosticEvent(event: DiagnosticEvent): string {
  const parts = [
    new Date(event.timestamp).toISOString(),
    event.level.toUpperCase(),
    event.event,
    `source=${event.source}`,
  ];

  if (event.deploymentId !== null) parts.push(`deployment=${event.deploymentId}`);
  const issue = formatIssueRef(event);
  if (issue) parts.push(issue);
  if (event.correlationId) parts.push(`correlation=${event.correlationId}`);
  if (event.status) parts.push(`status=${event.status}`);
  if (event.message) parts.push(`- ${event.message}`);

  return parts.join(" ");
}

function buildQuery(
  options: CommonOptions | ShowOptions,
  timeFilters: Pick<DiagnosticQuery, "since" | "until"> = {},
): DiagnosticQuery {
  const query: DiagnosticQuery = {
    ...timeFilters,
    limit: parsePositiveInteger(options.limit ?? "100", "--limit"),
  };

  if (options.issue) query.issue = parseIssueRef(options.issue);
  if (options.deployment) {
    query.deploymentId = parsePositiveInteger(options.deployment, "--deployment");
  }
  if (options.correlation) query.correlationId = options.correlation;
  if ("event" in options && options.event) query.events = options.event;
  if ("level" in options && options.level) query.levels = parseLevels(options.level);

  return query;
}

function parsePositiveInteger(value: string, optionName: string): number {
  if (!/^[1-9]\d*$/.test(value.trim())) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return Number(value);
}

function parseLevels(values: string[]): DiagnosticLevel[] {
  return values.map((value) => {
    if (!VALID_LEVELS.has(value as DiagnosticLevel)) {
      throw new Error(`Invalid level "${value}". Use one of: debug, info, warn, error.`);
    }
    return value as DiagnosticLevel;
  });
}

function parseIsoTimestamp(value: string, optionName: string): number {
  const trimmed = value.trim();
  const match = ISO_TIMESTAMP_PATTERN.exec(trimmed);
  if (!match) {
    throw new Error(`${optionName} must be a valid ISO timestamp.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number((match[7] ?? "").slice(0, 3).padEnd(3, "0"));
  const offsetSign = match[8] === "Z" ? 0 : match[9] === "+" ? 1 : -1;
  const offsetHour = match[10] ? Number(match[10]) : 0;
  const offsetMinute = match[11] ? Number(match[11]) : 0;

  if (
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    throw new Error(`${optionName} must be a valid ISO timestamp.`);
  }

  const localTimestamp = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const localDate = new Date(localTimestamp);
  if (
    localDate.getUTCFullYear() !== year ||
    localDate.getUTCMonth() !== month - 1 ||
    localDate.getUTCDate() !== day ||
    localDate.getUTCHours() !== hour ||
    localDate.getUTCMinutes() !== minute ||
    localDate.getUTCSeconds() !== second ||
    localDate.getUTCMilliseconds() !== millisecond
  ) {
    throw new Error(`${optionName} must be a valid ISO timestamp.`);
  }

  const offsetMs = offsetSign * (offsetHour * 60 + offsetMinute) * 60 * 1000;
  const timestamp = localTimestamp - offsetMs;
  if (!Number.isFinite(timestamp) || Date.parse(trimmed) !== timestamp) {
    throw new Error(`${optionName} must be a valid ISO timestamp.`);
  }

  return timestamp;
}

function parseCommandInput<T>(command: Command, parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof Error) {
      command.error(error.message);
    }
    throw error;
  }
}

function formatIssueRef(event: DiagnosticEvent): string | null {
  if (!event.owner || !event.repo || event.issueNumber === null) return null;
  return `${event.owner}/${event.repo}#${event.issueNumber}`;
}

function printEvents(events: DiagnosticEvent[], json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(events, null, 2)}\n`);
    return;
  }

  for (const event of events) {
    process.stdout.write(`${formatDiagnosticEvent(event)}\n`);
  }
}

function printBackendSummary(summaries: BackendSummary[], json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(summaries, null, 2)}\n`);
    return;
  }

  for (const summary of summaries) {
    process.stdout.write(
      [
        `backend=${summary.backend}`,
        `events=${summary.events}`,
        `launches=${summary.launches}`,
        `activations=${summary.activations}`,
        `first_output=${summary.firstOutput}`,
        `reconnects=${summary.reconnects}`,
        `failures=${summary.failures}`,
        `cleanups=${summary.cleanups}`,
      ].join(" ") + "\n",
    );
  }
}
