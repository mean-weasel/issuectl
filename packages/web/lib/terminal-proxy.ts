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
    const upstream = new WebSocket(`ws://127.0.0.1:${port}/ws`);

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
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data, { binary: isBinary });
        }
      });
    });

    clientWs.on("close", () => {
      if (upstream.readyState === WebSocket.OPEN) upstream.close();
    });

    upstream.on("close", () => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });

    upstream.on("error", (err) => {
      console.error(`[issuectl] upstream WS error for port ${port}:`, err.message);
      if (pendingClientMsgs.length > 0) {
        console.error(`[issuectl] ${pendingClientMsgs.length} buffered message(s) dropped for port ${port}`);
      }
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
      upstream.terminate();
    });

    clientWs.on("error", (err) => {
      console.error(`[issuectl] client WS error for port ${port}:`, err.message);
      upstream.terminate();
    });
  });
}
