import { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { spawn, type IPty } from "node-pty";
import {
  getDb,
  getDeploymentById,
  getRepoById,
  isTmuxSessionAlive,
  recordDiagnosticEventSafely,
  tmuxSessionName,
} from "@issuectl/core";
import log from "./logger";
import { sanitizePtyData } from "./pty-diagnostics-sanitize";
import { ensureNodePtySpawnHelperExecutable } from "./node-pty-spawn-helper";
import { validatePtyTerminalToken } from "./terminal-auth";

const ptyWss = new WebSocketServer({ noServer: true });
ptyWss.on("error", (err) => log.error({ err, msg: "pty_wss_error" }));

const MAX_INPUT_CHARS = 64 * 1024;
const MIN_COLS = 20, MAX_COLS = 240, MIN_ROWS = 5, MAX_ROWS = 80;
const BACKPRESSURE_BYTES = 1024 * 1024;

let activePtyWsConnections = 0;

type PtyClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number };

type PtyStats = {
  deploymentId: number; framesToClient: number; framesFromClient: number;
  bytesToClient: number; bytesFromClient: number; peakBuffered: number;
  backpressureDrops: number; backpressureShedding: boolean;
  firstOutputSeen: boolean; connectedAt: number;
};

export function activePtyWsCount(): number {
  return activePtyWsConnections;
}

export function isPtyBridgeEnabled(): boolean {
  return process.env.ISSUECTL_PTY_BRIDGE === "1";
}

export function parsePtyClientMessage(raw: WebSocket.RawData): PtyClientMessage | null {
  const text = raw.toString();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const message = parsed as Record<string, unknown>;
  if (message.type === "input" && typeof message.data === "string") {
    if (message.data.length > MAX_INPUT_CHARS) return null;
    return { type: "input", data: message.data };
  }
  if (message.type === "resize") {
    const cols = clampDimension(message.cols, MIN_COLS, MAX_COLS);
    const rows = clampDimension(message.rows, MIN_ROWS, MAX_ROWS);
    if (!cols || !rows) return null;
    return { type: "resize", cols, rows };
  }
  return null;
}

export async function handlePtyUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  deploymentId: number,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!validatePtyTerminalToken(url.searchParams.get("terminalToken"), deploymentId)) {
    recordPtyEvent(deploymentId, "warn", "pty.auth_failed", { status: "unauthorized" });
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  const context = loadPtyContext(deploymentId);
  if (!context.ok) {
    recordPtyEvent(deploymentId, "error", "pty.bridge_attach_failed", {
      status: context.status,
      message: context.message,
    });
    socket.write(`HTTP/1.1 ${context.httpStatus} ${context.status}\r\n\r\n`);
    socket.destroy();
    return;
  }

  recordPtyEvent(deploymentId, "info", "pty.bridge_attach_requested", { sessionName: context.sessionName });

  ptyWss.handleUpgrade(req, socket, head, (clientWs) => {
    activePtyWsConnections++;
    const stats = createStats(deploymentId);
    let attachPty: IPty | null = null;
    let cleanedUp = false;

    try {
      ensureNodePtySpawnHelperExecutable();
      attachPty = spawn("tmux", ["attach-session", "-t", context.sessionName], {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd: context.workspacePath,
        env: buildPtyEnv(),
      });
    } catch (err) {
      recordPtyEvent(deploymentId, "error", "pty.bridge_attach_failed", { message: err instanceof Error ? err.message : String(err) });
      activePtyWsConnections--;
      clientWs.close(1011, "attach failed");
      return;
    }

    recordPtyEvent(deploymentId, "info", "pty.ws_connected", { data: { activeWs: activePtyWsConnections } });
    recordPtyEvent(deploymentId, "info", "pty.bridge_attached");
    safeSend(clientWs, { type: "ready" });

    attachPty.onData((data) => {
      if (!stats.firstOutputSeen) {
        stats.firstOutputSeen = true;
        recordPtyEvent(deploymentId, "info", "pty.first_output_seen");
      }
      if (shouldDropForBackpressure(clientWs, stats)) return;
      stats.framesToClient++;
      stats.bytesToClient += Buffer.byteLength(data);
      safeSend(clientWs, { type: "output", data });
    });

    attachPty.onExit(({ exitCode, signal }) => {
      recordPtyEvent(deploymentId, "info", "pty.process_exit", { data: { exitCode, signal: signal ?? undefined } });
      safeSend(clientWs, { type: "exit", code: exitCode, signal });
      cleanup("pty_exit");
      clientWs.close();
    });

    clientWs.on("message", (raw) => {
      const message = parsePtyClientMessage(raw);
      if (!message || !attachPty) return;
      if (message.type === "input") {
        stats.framesFromClient++;
        stats.bytesFromClient += Buffer.byteLength(message.data);
        attachPty.write(message.data);
      } else {
        attachPty.resize(message.cols, message.rows);
        recordPtyEvent(deploymentId, "debug", "pty.resize", { data: { cols: message.cols, rows: message.rows } });
      }
    });

    clientWs.on("close", () => cleanup("client_close"));
    clientWs.on("error", (err) => {
      recordPtyEvent(deploymentId, "error", "pty.ws_error", { message: err instanceof Error ? err.message : String(err) });
      cleanup("client_error");
    });

    function cleanup(reason: string) {
      if (cleanedUp) return;
      cleanedUp = true;
      activePtyWsConnections--;
      if (attachPty) attachPty.kill();
      recordPtyClose(deploymentId, reason, stats);
    }
  });
}

function loadPtyContext(deploymentId: number):
  | { ok: true; sessionName: string; workspacePath: string }
  | { ok: false; httpStatus: number; status: string; message: string } {
  const db = getDb();
  const deployment = getDeploymentById(db, deploymentId);
  if (!deployment || deployment.endedAt !== null) {
    return { ok: false, httpStatus: 404, status: "not_found", message: "Deployment not found" };
  }
  if ((deployment as { terminalBackend?: string }).terminalBackend !== "pty_bridge") {
    return { ok: false, httpStatus: 404, status: "wrong_backend", message: "Deployment is not PTY bridge backed" };
  }
  const repo = getRepoById(db, deployment.repoId);
  if (!repo) return { ok: false, httpStatus: 404, status: "repo_missing", message: "Repository not found" };
  const sessionName = tmuxSessionName(repo.name, deployment.issueNumber);
  if (!isTmuxSessionAlive(sessionName)) {
    recordPtyEvent(deploymentId, "warn", "pty.tmux_missing", { sessionName });
    return { ok: false, httpStatus: 410, status: "tmux_missing", message: "tmux session is gone" };
  }
  return { ok: true, sessionName, workspacePath: deployment.workspacePath };
}

function buildPtyEnv(): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
    COLORTERM: "truecolor",
    SHELL: process.env.SHELL ?? "/bin/zsh",
    TERM: "xterm-256color",
  };
}

function createStats(deploymentId: number): PtyStats {
  return {
    deploymentId,
    framesToClient: 0,
    framesFromClient: 0,
    bytesToClient: 0,
    bytesFromClient: 0,
    peakBuffered: 0,
    backpressureDrops: 0,
    backpressureShedding: false,
    firstOutputSeen: false,
    connectedAt: Date.now(),
  };
}

function shouldDropForBackpressure(clientWs: WebSocket, stats: PtyStats): boolean {
  const buffered = clientWs.bufferedAmount;
  if (buffered > stats.peakBuffered) stats.peakBuffered = buffered;
  if (buffered <= BACKPRESSURE_BYTES) {
    if (stats.backpressureShedding) {
      stats.backpressureShedding = false;
      recordPtyEvent(stats.deploymentId, "warn", "pty.backpressure_clear", { data: { backpressureDrops: stats.backpressureDrops } });
    }
    return false;
  }
  if (!stats.backpressureShedding) {
    stats.backpressureShedding = true;
    recordPtyEvent(stats.deploymentId, "warn", "pty.backpressure_start", { data: { bufferedBytes: buffered } });
  }
  stats.backpressureDrops++;
  return true;
}

function safeSend(clientWs: WebSocket, payload: Record<string, unknown>): void {
  if (clientWs.readyState !== WebSocket.OPEN) return;
  clientWs.send(JSON.stringify(payload));
}

function recordPtyClose(deploymentId: number, reason: string, stats: PtyStats): void {
  recordPtyEvent(deploymentId, "info", "pty.ws_closed", {
    status: reason,
    data: {
      activeWs: activePtyWsConnections,
      backpressureDrops: stats.backpressureDrops,
      bytesFromClient: stats.bytesFromClient,
      bytesToClient: stats.bytesToClient,
      durationMs: Date.now() - stats.connectedAt,
      framesFromClient: stats.framesFromClient,
      framesToClient: stats.framesToClient,
      peakBuffered: stats.peakBuffered,
    },
  });
}

function recordPtyEvent(
  deploymentId: number,
  level: "debug" | "info" | "warn" | "error",
  event: string,
  input: { sessionName?: string; status?: string; message?: string; data?: Record<string, unknown> } = {},
): void {
  try {
    const db = getDb();
    const deployment = getDeploymentById(db, deploymentId);
    const repo = deployment ? getRepoById(db, deployment.repoId) : undefined;
    recordDiagnosticEventSafely(db, {
      level,
      event,
      source: "web.pty-terminal",
      owner: repo?.owner,
      repo: repo?.name,
      issueNumber: deployment?.issueNumber,
      deploymentId,
      sessionName: input.sessionName,
      status: input.status,
      message: input.message,
      data: sanitizePtyData(input.data),
    });
  } catch {
    // Diagnostics should not break terminal attach behavior.
  }
}

function clampDimension(value: unknown, min: number, max: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, Math.floor(value as number)));
}
