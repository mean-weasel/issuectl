import { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { getDb, getActiveDeploymentByPort } from "@issuectl/core";

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
  const db = getDb();
  return getActiveDeploymentByPort(db, port) !== undefined;
}

/**
 * Proxy an HTTP request to a local ttyd instance and return the response.
 * Used by the Route Handlers to forward HTML/JS/CSS asset requests.
 */
export async function proxyHttpRequest(
  port: number,
  path: string,
): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
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
export function rewriteHtml(html: string, port: number): string {
  const prefix = `/api/terminal/${port}`;
  return html
    .replace(/(href|src|action)="\/(?!\/)/g, `$1="${prefix}/`)
    .replace(/(href|src|action)='\/(?!\/)/g, `$1='${prefix}/`);
}

const wss = new WebSocketServer({ noServer: true });
wss.on("error", (err) => {
  console.error("[issuectl] WebSocketServer error:", err.message);
});

// ---------------------------------------------------------------------------
// Diagnostic: per-connection frame stats (logged every DIAG_INTERVAL_MS)
// ---------------------------------------------------------------------------
const DIAG_INTERVAL_MS = 5_000;

interface WsStats {
  clientIp: string;
  port: number;
  framesFromTtyd: number;
  framesToClient: number;
  bytesToClient: number;
  peakBufferedAmount: number;
  droppedFrames: number;
  connectedAt: number;
}

function logStats(s: WsStats, label: string): void {
  const uptimeSec = ((Date.now() - s.connectedAt) / 1000).toFixed(1);
  console.log(
    `[issuectl:diag] ${label} port=${s.port} client=${s.clientIp} ` +
    `uptime=${uptimeSec}s frames_in=${s.framesFromTtyd} frames_out=${s.framesToClient} ` +
    `bytes_out=${s.bytesToClient} peak_buffered=${s.peakBufferedAmount} dropped=${s.droppedFrames}`,
  );
}

/**
 * Handle an HTTP upgrade request for a terminal WebSocket. Called from
 * `server.ts`'s `upgrade` event listener.
 */
export function handleUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  port: number,
): void {
  if (!isValidTerminalPort(port)) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (clientWs) => {
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
      connectedAt: Date.now(),
    };

    console.log(`[issuectl:diag] ws_connect port=${port} client=${clientIp}`);

    const diagTimer = setInterval(() => logStats(stats, "ws_tick"), DIAG_INTERVAL_MS);

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
        upstream.send(data, { binary: isBinary });
      } else {
        pendingClientMsgs.push({ data, isBinary });
      }
    });

    upstream.on("open", () => {
      for (const msg of pendingClientMsgs) {
        if (upstream.readyState !== WebSocket.OPEN) break;
        upstream.send(msg.data, { binary: msg.isBinary });
      }
      pendingClientMsgs.length = 0;

      upstream.on("message", (data, isBinary) => {
        stats.framesFromTtyd++;

        if (clientWs.readyState !== WebSocket.OPEN) {
          stats.droppedFrames++;
          return;
        }

        const buffered = clientWs.bufferedAmount;
        if (buffered > stats.peakBufferedAmount) {
          stats.peakBufferedAmount = buffered;
        }

        const len = data instanceof Buffer ? data.length
          : data instanceof ArrayBuffer ? data.byteLength
          : (data as Buffer[]).reduce((acc, b) => acc + b.length, 0);
        stats.bytesToClient += len;
        stats.framesToClient++;

        clientWs.send(data, { binary: isBinary });
      });
    });

    function cleanup() {
      clearInterval(diagTimer);
      logStats(stats, "ws_close");
    }

    clientWs.on("close", () => {
      cleanup();
      if (upstream.readyState === WebSocket.OPEN) upstream.close();
    });

    upstream.on("close", () => {
      cleanup();
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });

    upstream.on("error", (err) => {
      console.error(`[issuectl] upstream WS error for port ${port}:`, err.message);
      if (pendingClientMsgs.length > 0) {
        console.error(`[issuectl] ${pendingClientMsgs.length} buffered message(s) dropped for port ${port}`);
      }
      cleanup();
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
      upstream.terminate();
    });

    clientWs.on("error", (err) => {
      console.error(`[issuectl] client WS error for port ${port}:`, err.message);
      cleanup();
      upstream.terminate();
    });
  });
}
