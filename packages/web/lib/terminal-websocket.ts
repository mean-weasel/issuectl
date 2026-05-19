import { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { registerPort, unregisterPort, recordPtyOutput } from "./idle-registry";
import log from "./logger";
import { ensureTtydRunning, isValidTerminalPort } from "./terminal-lifecycle";
import { validateTerminalToken } from "./terminal-auth";

const wss = new WebSocketServer({ noServer: true });
wss.on("error", (err) => {
  log.error({ err, msg: "wss_error" });
});

let _activeWsCount = 0;

export function activeWsCount(): number {
  return _activeWsCount;
}

const BACKPRESSURE_BYTES = 1024 * 1024;
const TICK_INTERVAL_MS = 5_000;

interface WsStats {
  readonly clientIp: string;
  readonly port: number;
  framesFromTtyd: number;
  framesToClient: number;
  bytesToClient: number;
  peakBufferedAmount: number;
  droppedFrames: number;
  backpressureDrops: number;
  backpressureShedding: boolean;
  backpressureEpisodeDrops: number;
  readonly connectedAt: number;
}

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
    const stats = createStats(port, clientIp);

    log.info({ msg: "ws_connect", port, clientIp, activeWs: _activeWsCount });

    const tickTimer = setInterval(() => logTick(stats), TICK_INTERVAL_MS);
    const protocols = req.headers["sec-websocket-protocol"]?.split(",").map((s) => s.trim());
    const upstream = new WebSocket(`ws://127.0.0.1:${port}/ws`, protocols);
    const pendingClientMsgs: { data: Buffer | ArrayBuffer | Buffer[]; isBinary: boolean }[] = [];

    clientWs.on("message", (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) {
        if (!safeSend(upstream, data, { binary: isBinary }, "client_to_upstream", port)) {
          stats.droppedFrames++;
        }
      } else if (upstream.readyState === WebSocket.CONNECTING) {
        pendingClientMsgs.push({ data, isBinary });
      }
    });

    upstream.on("open", () => {
      flushPending(upstream, pendingClientMsgs, stats, port);
      upstream.on("message", (data, isBinary) => {
        forwardFromUpstream(clientWs, data, isBinary, stats);
      });
    });

    let cleanedUp = false;
    function cleanup(reason: string) {
      if (cleanedUp) return;
      cleanedUp = true;
      _activeWsCount--;
      clearInterval(tickTimer);
      unregisterPort(port);
      logClose(reason, stats, _activeWsCount);
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
      log.error({ err, msg: "ws_upstream_error", port, clientIp, bufferedMsgs: pendingClientMsgs.length });
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

function createStats(port: number, clientIp: string): WsStats {
  return {
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
}

function forwardFromUpstream(
  clientWs: WebSocket,
  data: Buffer | ArrayBuffer | Buffer[],
  isBinary: boolean,
  stats: WsStats,
) {
  stats.framesFromTtyd++;
  recordPtyOutput(stats.port, Date.now());
  if (clientWs.readyState !== WebSocket.OPEN) {
    stats.droppedFrames++;
    return;
  }
  if (shouldDropForBackpressure(clientWs, stats)) return;
  const len = frameByteLength(data);
  if (safeSend(clientWs, data, { binary: isBinary }, "upstream_to_client", stats.port)) {
    stats.bytesToClient += len;
    stats.framesToClient++;
  } else {
    stats.droppedFrames++;
  }
}

function frameByteLength(data: Buffer | ArrayBuffer | Buffer[]): number {
  if (data instanceof Buffer) return data.length;
  if (data instanceof ArrayBuffer) return data.byteLength;
  let total = 0;
  for (const chunk of data as Buffer[]) {
    total += chunk.length;
  }
  return total;
}

function shouldDropForBackpressure(clientWs: WebSocket, stats: WsStats): boolean {
  const buffered = clientWs.bufferedAmount;
  if (buffered > stats.peakBufferedAmount) stats.peakBufferedAmount = buffered;
  if (buffered <= BACKPRESSURE_BYTES) {
    if (stats.backpressureShedding) {
      stats.backpressureShedding = false;
      log.warn({
        msg: "ws_backpressure_clear",
        port: stats.port,
        clientIp: stats.clientIp,
        droppedDuringEpisode: stats.backpressureEpisodeDrops,
      });
      stats.backpressureEpisodeDrops = 0;
    }
    return false;
  }
  if (!stats.backpressureShedding) {
    stats.backpressureShedding = true;
    log.warn({ msg: "ws_backpressure_start", port: stats.port, clientIp: stats.clientIp, bufferedBytes: buffered });
  }
  stats.backpressureDrops++;
  stats.backpressureEpisodeDrops++;
  return true;
}

function flushPending(
  upstream: WebSocket,
  pendingClientMsgs: { data: Buffer | ArrayBuffer | Buffer[]; isBinary: boolean }[],
  stats: WsStats,
  port: number,
) {
  for (const msg of pendingClientMsgs) {
    if (!safeSend(upstream, msg.data, { binary: msg.isBinary }, "flush_buffered", port)) {
      stats.droppedFrames++;
      break;
    }
  }
  pendingClientMsgs.length = 0;
}

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

function logTick(stats: WsStats) {
  log.debug({
    msg: "ws_tick",
    port: stats.port,
    clientIp: stats.clientIp,
    uptimeSec: ((Date.now() - stats.connectedAt) / 1000).toFixed(1),
    framesIn: stats.framesFromTtyd,
    framesOut: stats.framesToClient,
    bytesOut: stats.bytesToClient,
    peakBuffered: stats.peakBufferedAmount,
    dropped: stats.droppedFrames,
    backpressureDrops: stats.backpressureDrops,
  });
}

function logClose(reason: string, stats: WsStats, activeWs: number) {
  log.info({
    msg: "ws_close",
    reason,
    port: stats.port,
    clientIp: stats.clientIp,
    uptimeSec: ((Date.now() - stats.connectedAt) / 1000).toFixed(1),
    framesIn: stats.framesFromTtyd,
    framesOut: stats.framesToClient,
    bytesOut: stats.bytesToClient,
    peakBuffered: stats.peakBufferedAmount,
    dropped: stats.droppedFrames,
    backpressureDrops: stats.backpressureDrops,
    activeWs,
  });
}
