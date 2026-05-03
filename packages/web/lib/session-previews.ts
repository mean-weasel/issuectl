import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { tmuxSessionName, type ActiveDeploymentWithRepo } from "@issuectl/core";

const CAPTURE_HISTORY_LINES = 40;
const PREVIEW_LINES = 20;
const PREVIEW_LINE_MAX_CHARS = 240;
const TMUX_CAPTURE_TIMEOUT_MS = 750;
const MAX_CAPTURE_CONCURRENCY = 6;
const RESPONSE_CACHE_TTL_MS = 1_000;
const ACTIVE_WINDOW_MS = 5_000;
const IDLE_WINDOW_MS = 30_000;
const ESC = String.fromCharCode(27);
const ANSI_SEQUENCE_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");
const OSC_SEQUENCE_RE = new RegExp(`${ESC}\\][^\\u0007]*(?:\\u0007|${ESC}\\\\)`, "g");
const SINGLE_CHAR_ESCAPE_RE = new RegExp(`${ESC}[ -/]*[@-~]`, "g");

export type SessionPreviewStatus = "active" | "idle" | "error" | "unavailable";

export interface SessionPreview {
  lines: string[];
  lastUpdatedMs: number;
  lastChangedMs: number | null;
  status: SessionPreviewStatus;
}

interface PreviewCacheEntry {
  readonly port: number;
  readonly sessionName: string;
  lines: string[];
  hash: string;
  lastUpdatedMs: number;
  lastChangedMs: number | null;
  status: SessionPreviewStatus;
}

const previewCache = new Map<number, PreviewCacheEntry>();
let responseCache:
  | { activeSessionsKey: string; generatedAtMs: number; previews: Record<string, SessionPreview> }
  | undefined;
let responseInFlight:
  | { activeSessionsKey: string; promise: Promise<Record<string, SessionPreview>> }
  | undefined;

const ERROR_PATTERNS = [
  /\bError:/i,
  /\bFAILED\b/i,
  /\bpanic\b/i,
  /\bexception\b/i,
  /\btraceback\b/i,
  /\bexit code\s+\d+/i,
  /\bcommand failed\b/i,
  /\bfatal:/i,
];

export function resetSessionPreviewCache(): void {
  previewCache.clear();
  responseCache = undefined;
  responseInFlight = undefined;
}

export function derivePreviewStatus(
  lines: string[],
  lastChangedMs: number | null,
  nowMs: number,
): SessionPreviewStatus {
  if (lines.length === 0) {
    return "idle";
  }
  const text = lines.join("\n");
  if (ERROR_PATTERNS.some((pattern) => pattern.test(text))) {
    return "error";
  }
  if (lastChangedMs === null) {
    return "idle";
  }
  const ageMs = nowMs - lastChangedMs;
  if (ageMs <= ACTIVE_WINDOW_MS) {
    return "active";
  }
  if (ageMs >= IDLE_WINDOW_MS) {
    return "idle";
  }
  return "active";
}

export function normalizeCapturedPane(output: string): string[] {
  return output
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => stripUnsupportedControlSequences(line).trimEnd())
    .map(truncatePreviewLine)
    .filter((line) => line.length > 0)
    .slice(-PREVIEW_LINES);
}

function truncatePreviewLine(line: string): string {
  if (line.length <= PREVIEW_LINE_MAX_CHARS) return line;
  return `${line.slice(0, PREVIEW_LINE_MAX_CHARS - 3)}...`;
}

function stripUnsupportedControlSequences(value: string): string {
  return [...value
    .replace(OSC_SEQUENCE_RE, "")
    .replace(ANSI_SEQUENCE_RE, "")
    .replace(SINGLE_CHAR_ESCAPE_RE, "")]
    .filter((char) => {
      const codePoint = char.codePointAt(0);
      if (codePoint === undefined) return false;
      return codePoint === 9 || codePoint >= 32 && codePoint !== 127;
    })
    .join("");
}

function hashLines(lines: string[]): string {
  return createHash("sha1").update(lines.join("\n")).digest("hex");
}

async function captureTmuxPane(sessionName: string): Promise<string[]> {
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      "tmux",
      ["capture-pane", "-p", "-t", sessionName, "-S", `-${CAPTURE_HISTORY_LINES}`],
      { timeout: TMUX_CAPTURE_TIMEOUT_MS, maxBuffer: 64 * 1024 },
      (err, stdout) => {
        if (err) {
          reject(err);
        } else {
          resolve(stdout);
        }
      },
    );
  });
  return normalizeCapturedPane(stdout);
}

async function getPreviewForDeployment(
  deployment: ActiveDeploymentWithRepo,
  nowMs: number,
): Promise<[number, SessionPreview] | null> {
  const port = deployment.ttydPort;
  if (port === null) return null;

  const sessionName = tmuxSessionName(deployment.repoName, deployment.issueNumber);
  const cachedForPort = previewCache.get(port);
  const cached = cachedForPort?.sessionName === sessionName ? cachedForPort : undefined;

  try {
    const lines = await captureTmuxPane(sessionName);
    const hash = hashLines(lines);
    const changed = cached === undefined || cached.hash !== hash;
    const lastChangedMs = changed ? nowMs : cached.lastChangedMs;
    const status = derivePreviewStatus(lines, lastChangedMs, nowMs);
    const entry: PreviewCacheEntry = {
      port,
      sessionName,
      lines,
      hash,
      lastUpdatedMs: nowMs,
      lastChangedMs,
      status,
    };
    previewCache.set(port, entry);
    return [port, previewFromEntry(entry)];
  } catch {
    if (cached) {
      const entry: PreviewCacheEntry = {
        ...cached,
        lastUpdatedMs: nowMs,
        status: "unavailable",
      };
      previewCache.set(port, entry);
      return [port, previewFromEntry(entry)];
    }

    return [
      port,
      {
        lines: [],
        lastUpdatedMs: nowMs,
        lastChangedMs: null,
        status: "unavailable",
      },
    ];
  }
}

function previewFromEntry(entry: PreviewCacheEntry): SessionPreview {
  return {
    lines: entry.lines,
    lastUpdatedMs: entry.lastUpdatedMs,
    lastChangedMs: entry.lastChangedMs,
    status: entry.status,
  };
}

export async function getSessionPreviews(
  deployments: ActiveDeploymentWithRepo[],
  nowMs = Date.now(),
): Promise<Record<string, SessionPreview>> {
  const activeSessions = deployments
    .map((deployment) => {
      if (deployment.ttydPort === null) return null;
      return {
        port: deployment.ttydPort,
        sessionName: tmuxSessionName(deployment.repoName, deployment.issueNumber),
      };
    })
    .filter((session): session is { port: number; sessionName: string } => session !== null);
  const activePorts = new Set(activeSessions.map((session) => session.port));
  const activeSessionsKey = activeSessions
    .map((session) => `${session.port}:${session.sessionName}`)
    .sort()
    .join(",");
  if (
    responseCache
    && responseCache.activeSessionsKey === activeSessionsKey
    && nowMs - responseCache.generatedAtMs < RESPONSE_CACHE_TTL_MS
  ) {
    return responseCache.previews;
  }

  if (responseInFlight?.activeSessionsKey === activeSessionsKey) {
    return responseInFlight.promise;
  }

  const promise = getFreshSessionPreviews(deployments, activePorts, activeSessionsKey, nowMs);
  responseInFlight = { activeSessionsKey, promise };

  try {
    return await promise;
  } finally {
    if (responseInFlight?.promise === promise) {
      responseInFlight = undefined;
    }
  }
}

async function getFreshSessionPreviews(
  deployments: ActiveDeploymentWithRepo[],
  activePorts: Set<number>,
  activeSessionsKey: string,
  nowMs: number,
): Promise<Record<string, SessionPreview>> {
  for (const port of previewCache.keys()) {
    if (!activePorts.has(port)) {
      previewCache.delete(port);
    }
  }

  const entries = await mapLimit(
    deployments,
    MAX_CAPTURE_CONCURRENCY,
    (deployment) => getPreviewForDeployment(deployment, nowMs),
  );

  const previews = Object.fromEntries(
    entries.filter((entry): entry is [number, SessionPreview] => entry !== null),
  );
  responseCache = { activeSessionsKey, generatedAtMs: nowMs, previews };
  return previews;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }

  const workerCount = Math.min(Math.max(limit, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}
