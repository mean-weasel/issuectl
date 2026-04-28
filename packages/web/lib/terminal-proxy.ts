import { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import {
  getDb,
  getActiveDeploymentByPort,
  getRepoById,
  isTtydAlive,
  isTmuxSessionAlive,
  tmuxSessionName,
  respawnTtyd,
  updateTtydInfo,
  endDeployment,
} from "@issuectl/core";
import log from "./logger";
import { registerPort, unregisterPort, recordPtyOutput } from "./idle-registry";
import { validateTerminalToken } from "./terminal-auth";

const PORT_MIN = 7700;
const PORT_MAX = 7799;

/**
 * Validate that a port number is in the ttyd range and belongs to an
 * active deployment. This is the security boundary — only ports with
 * a live deployment row are proxied.
 */
export function isValidTerminalPort(port: number): boolean {
  if (!Number.isFinite(port) || port < PORT_MIN || port > PORT_MAX) {
    return false;
  }
  try {
    const db = getDb();
    return getActiveDeploymentByPort(db, port) !== undefined;
  } catch (err) {
    log.error({ msg: "terminal_port_check_db_error", port, err });
    return false;
  }
}

// Per-port respawn coalescing — concurrent callers (HTTP + WS arrive
// near-simultaneously) share a single respawn attempt instead of racing.
const respawnInFlight = new Map<number, Promise<boolean>>();

/**
 * Ensure the ttyd process for a port is alive. If ttyd has exited
 * (due to `-q` quit-on-disconnect) but the tmux session is still
 * running, respawn ttyd against the existing session and update the DB.
 *
 * Returns `true` when ttyd is now running and safe to proxy to.
 * Returns `false` when the connection should not proceed — either
 * because no active deployment exists, the repo was not found, the
 * tmux session is dead, or respawn failed.
 */
async function ensureTtydRunning(port: number): Promise<boolean> {
  let db;
  try {
    db = getDb();
  } catch (err) {
    log.error({ msg: "ttyd_respawn_db_unavailable", port, err });
    return false;
  }

  const deployment = getActiveDeploymentByPort(db, port);
  if (!deployment) {
    log.debug({ msg: "ttyd_no_active_deployment", port });
    return false;
  }

  // No PID recorded — skip liveness check and return false so the
  // proxy doesn't attempt a connection to a port with nothing listening.
  if (!deployment.ttydPid) {
    log.warn({ msg: "ttyd_no_pid_recorded", port, deploymentId: deployment.id });
    return false;
  }

  // ttyd is still running — nothing to do
  if (isTtydAlive(deployment.ttydPid)) return true;

  // ttyd is dead — coalesce concurrent respawn attempts for the same port
  const existing = respawnInFlight.get(port);
  if (existing) return existing;

  const promise = doRespawn(port, deployment, db);
  respawnInFlight.set(port, promise);
  try {
    return await promise;
  } finally {
    respawnInFlight.delete(port);
  }
}

async function doRespawn(
  port: number,
  deployment: { id: number; repoId: number; issueNumber: number; ttydPid: number | null },
  db: ReturnType<typeof getDb>,
): Promise<boolean> {
  const repo = getRepoById(db, deployment.repoId);
  if (!repo) {
    log.warn({ msg: "ttyd_respawn_no_repo", port, deploymentId: deployment.id, repoId: deployment.repoId });
    return false;
  }

  const sessionName = tmuxSessionName(repo.name, deployment.issueNumber);

  let sessionAlive: boolean;
  try {
    sessionAlive = isTmuxSessionAlive(sessionName);
  } catch (err) {
    // Transient failure (ETIMEDOUT, EPERM) — don't end the deployment,
    // don't proxy. The liveness checker will retry on the next interval.
    log.error({ msg: "ttyd_tmux_check_failed", port, deploymentId: deployment.id, sessionName, err });
    return false;
  }

  if (!sessionAlive) {
    try {
      endDeployment(db, deployment.id);
    } catch (err) {
      log.debug({ msg: "ttyd_end_deployment_skipped", deploymentId: deployment.id, err });
    }
    log.info({ msg: "ttyd_session_dead", port, deploymentId: deployment.id, sessionName });
    return false;
  }

  // tmux alive, ttyd dead → respawn
  try {
    const result = await respawnTtyd(port, sessionName);
    updateTtydInfo(db, deployment.id, port, result.pid);
    log.info({
      msg: "ttyd_respawned",
      port,
      deploymentId: deployment.id,
      oldPid: deployment.ttydPid,
      newPid: result.pid,
      sessionName,
    });
    return true;
  } catch (err) {
    log.error({ msg: "ttyd_respawn_failed", port, deploymentId: deployment.id, err });
    return false;
  }
}

/**
 * Proxy an HTTP request to a local ttyd instance and return the response.
 * Used by the Route Handlers to forward HTML/JS/CSS asset requests.
 */
export async function proxyHttpRequest(
  port: number,
  path: string,
): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  // Respawn ttyd if it exited since the last connection
  const alive = await ensureTtydRunning(port);
  if (!alive) {
    return {
      status: 502,
      headers: { "content-type": "text/plain" },
      body: Buffer.from("Terminal session has ended"),
    };
  }

  const url = `http://127.0.0.1:${port}${path}`;
  const res = await fetch(url);
  const body = Buffer.from(await res.arrayBuffer());
  const headers = Object.fromEntries(res.headers.entries());
  return { status: res.status, headers, body };
}

/**
 * Rewrite root-relative URLs in ttyd's HTML so asset requests route
 * back through the proxy. ttyd serves paths like `/token`,
 * `/auth_token.js`, etc. that need to become
 * `/api/terminal/{port}/token`, etc.
 */
export function rewriteHtml(html: string, port: number, terminalToken?: string): string {
  const prefix = `/api/terminal/${port}`;
  const token = terminalToken;
  const encodedToken = token ? encodeURIComponent(token) : "";
  const tokenQuery = encodedToken ? `?terminalToken=${encodedToken}` : "";
  const wsPatch = terminalToken
    ? `<script>(()=>{const token=${JSON.stringify(token)};const port=${JSON.stringify(port)};const Native=window.WebSocket;function AuthWebSocket(url,protocols){try{const u=new URL(url,window.location.href);if(u.origin===window.location.origin&&u.pathname.startsWith("/api/terminal/"+port+"/")&&!u.searchParams.has("terminalToken")){u.searchParams.set("terminalToken",token);url=u.toString();}}catch{}return protocols===undefined?new Native(url):new Native(url,protocols)}AuthWebSocket.prototype=Native.prototype;Object.setPrototypeOf(AuthWebSocket,Native);window.WebSocket=AuthWebSocket;})();</script>`
    : "";
  const rewritten = html
    .replace(/(href|src|action)="\/(?!\/)/g, `$1="${prefix}/`)
    .replace(/(href|src|action)='\/(?!\/)/g, `$1='${prefix}/`);
  const withToken = tokenQuery
    ? rewritten.replace(
        /(href|src|action)=(["'])(\/api\/terminal\/\d+\/[^"']*?)(["'])/g,
        (_match, attr: string, quote: string, url: string, endQuote: string) => {
          if (url.includes("terminalToken=")) return `${attr}=${quote}${url}${endQuote}`;
          const separator = url.includes("?") ? "&" : "?";
          return `${attr}=${quote}${url}${separator}terminalToken=${encodedToken}${endQuote}`;
        },
      )
    : rewritten;
  if (!wsPatch) return withToken;
  return withToken.includes("</head>")
    ? withToken.replace("</head>", `${wsPatch}</head>`)
    : `${wsPatch}${withToken}`;
}

const wss = new WebSocketServer({ noServer: true });
wss.on("error", (err) => {
  log.error({ err, msg: "wss_error" });
});

// ---------------------------------------------------------------------------
// Active connection tracking
// ---------------------------------------------------------------------------

let _activeWsCount = 0;

/** Number of currently active WebSocket proxy connections. */
export function activeWsCount(): number {
  return _activeWsCount;
}

// ---------------------------------------------------------------------------
// Back-pressure threshold
// ---------------------------------------------------------------------------

// When the client WebSocket's send buffer exceeds this, we drop frames
// from ttyd rather than queueing unboundedly. 1 MB is generous — a
// typical terminal frame is under 4 KB, so this accommodates ~250
// queued frames before shedding. This prevents OOM when ttyd produces
// fast output over a slow tunnel (e.g. Cloudflare → mobile).
const BACKPRESSURE_BYTES = 1024 * 1024;

// ---------------------------------------------------------------------------
// Safe send helper
// ---------------------------------------------------------------------------

function safeSend(
  ws: WebSocket,
  data: Buffer | ArrayBuffer | Buffer[],
  opts: { binary: boolean },
  label: string,
  port: number,
): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(data, opts);
    return true;
  } catch (err) {
    log.error({ err, msg: "ws_send_error", label, port });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Per-connection frame stats (logged every TICK_INTERVAL_MS at debug level)
// ---------------------------------------------------------------------------
const TICK_INTERVAL_MS = 5_000;

interface WsStats {
  readonly clientIp: string;
  readonly port: number;
  /** Frames received from the ttyd upstream WebSocket. */
  framesFromTtyd: number;
  /** Frames successfully forwarded to the client. */
  framesToClient: number;
  /** Total bytes successfully sent to the client. */
  bytesToClient: number;
  /** High-water mark of clientWs.bufferedAmount. */
  peakBufferedAmount: number;
  /** Frames dropped in either direction because the destination was not OPEN or safeSend failed (disjoint from backpressureDrops). */
  droppedFrames: number;
  /** Frames dropped due to backpressure (buffer > threshold). Disjoint from droppedFrames; cumulative across episodes. */
  backpressureDrops: number;
  /** True while actively shedding frames due to backpressure. */
  backpressureShedding: boolean;
  /** Drops in the current backpressure episode (reset on clear). */
  backpressureEpisodeDrops: number;
  readonly connectedAt: number;
}

/**
 * Handle an HTTP upgrade request for a terminal WebSocket. Called from
 * `server.ts`'s `upgrade` event listener. Async because it may need to
 * respawn ttyd before upgrading — the caller must `.catch()` the result.
 */
export async function handleUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  port: number,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!validateTerminalToken(url.searchParams.get("terminalToken"), port)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  if (!isValidTerminalPort(port)) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  // Respawn ttyd before upgrading — this keeps the wss.handleUpgrade
  // callback synchronous, avoiding unhandled promise rejections.
  const alive = await ensureTtydRunning(port);
  if (!alive) {
    socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (clientWs) => {
    _activeWsCount++;
    registerPort(port, Date.now());

    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress
      ?? "unknown";

    const stats: WsStats = {
      clientIp,
      port,
      framesFromTtyd: 0,
      framesToClient: 0,
      bytesToClient: 0,
      peakBufferedAmount: 0,
      droppedFrames: 0,
      backpressureDrops: 0,
      backpressureShedding: false,
      backpressureEpisodeDrops: 0,
      connectedAt: Date.now(),
    };

    log.info({ msg: "ws_connect", port, clientIp, activeWs: _activeWsCount });

    const tickTimer = setInterval(() => {
      log.debug({
        msg: "ws_tick",
        port,
        clientIp,
        uptimeSec: ((Date.now() - stats.connectedAt) / 1000).toFixed(1),
        framesIn: stats.framesFromTtyd,
        framesOut: stats.framesToClient,
        bytesOut: stats.bytesToClient,
        peakBuffered: stats.peakBufferedAmount,
        dropped: stats.droppedFrames,
        backpressureDrops: stats.backpressureDrops,
      });
    }, TICK_INTERVAL_MS);

    // Forward the subprotocol (ttyd requires "tty") so the upstream
    // handshake succeeds and the terminal session initializes.
    const protocols = req.headers["sec-websocket-protocol"]?.split(",").map((s) => s.trim());
    const upstream = new WebSocket(`ws://127.0.0.1:${port}/ws`, protocols);

    // Buffer client messages that arrive before upstream is ready.
    // ttyd's client-side JS sends the handshake (token + terminal size)
    // immediately on open, which often arrives while upstream is still
    // CONNECTING.
    const pendingClientMsgs: { data: Buffer | ArrayBuffer | Buffer[]; isBinary: boolean }[] = [];
    clientWs.on("message", (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) {
        if (!safeSend(upstream, data, { binary: isBinary }, "client_to_upstream", port)) {
          stats.droppedFrames++;
        }
      } else if (upstream.readyState === WebSocket.CONNECTING) {
        pendingClientMsgs.push({ data, isBinary });
      }
      // CLOSING/CLOSED: silently drop — the close/error handlers will
      // clean up the connection.
    });

    upstream.on("open", () => {
      for (const msg of pendingClientMsgs) {
        if (!safeSend(upstream, msg.data, { binary: msg.isBinary }, "flush_buffered", port)) break;
      }
      pendingClientMsgs.length = 0;

      upstream.on("message", (data, isBinary) => {
        stats.framesFromTtyd++;
        recordPtyOutput(port, Date.now());

        if (clientWs.readyState !== WebSocket.OPEN) {
          stats.droppedFrames++;
          return;
        }

        // Back-pressure: if the client's send buffer is full (slow
        // tunnel), drop this frame rather than queueing unboundedly.
        const buffered = clientWs.bufferedAmount;
        if (buffered > stats.peakBufferedAmount) {
          stats.peakBufferedAmount = buffered;
        }
        if (buffered > BACKPRESSURE_BYTES) {
          if (!stats.backpressureShedding) {
            stats.backpressureShedding = true;
            log.warn({ msg: "ws_backpressure_start", port, clientIp, bufferedBytes: buffered });
          }
          stats.backpressureDrops++;
          stats.backpressureEpisodeDrops++;
          return;
        }
        if (stats.backpressureShedding) {
          stats.backpressureShedding = false;
          log.warn({ msg: "ws_backpressure_clear", port, clientIp, droppedDuringEpisode: stats.backpressureEpisodeDrops });
          stats.backpressureEpisodeDrops = 0;
        }

        let len: number;
        if (data instanceof Buffer) {
          len = data.length;
        } else if (data instanceof ArrayBuffer) {
          len = data.byteLength;
        } else {
          len = (data as Buffer[]).reduce((acc, b) => acc + b.length, 0);
        }

        if (safeSend(clientWs, data, { binary: isBinary }, "upstream_to_client", port)) {
          stats.bytesToClient += len;
          stats.framesToClient++;
        } else {
          stats.droppedFrames++;
        }
      });
    });

    let cleanedUp = false;
    function cleanup(reason: string) {
      if (cleanedUp) return;
      cleanedUp = true;
      _activeWsCount--;
      clearInterval(tickTimer);
      unregisterPort(port);

      const uptimeSec = ((Date.now() - stats.connectedAt) / 1000).toFixed(1);
      log.info({
        msg: "ws_close",
        reason,
        port,
        clientIp,
        uptimeSec,
        framesIn: stats.framesFromTtyd,
        framesOut: stats.framesToClient,
        bytesOut: stats.bytesToClient,
        peakBuffered: stats.peakBufferedAmount,
        dropped: stats.droppedFrames,
        backpressureDrops: stats.backpressureDrops,
        activeWs: _activeWsCount,
      });
    }

    clientWs.on("close", () => {
      cleanup("client_close");
      if (upstream.readyState === WebSocket.OPEN) upstream.close();
    });

    upstream.on("close", () => {
      cleanup("upstream_close");
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });

    upstream.on("error", (err) => {
      log.error({
        err,
        msg: "ws_upstream_error",
        port,
        clientIp,
        bufferedMsgs: pendingClientMsgs.length,
      });
      cleanup("upstream_error");
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
      upstream.terminate();
    });

    clientWs.on("error", (err) => {
      log.error({ err, msg: "ws_client_error", port, clientIp });
      cleanup("client_error");
      upstream.terminate();
    });
  });
}
