import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { getDb, listWebhookLogEntries, type WebhookLogEntry } from "@issuectl/core";
import { validateApiToken } from "./api-auth";
import log from "./logger";

const WEBHOOK_EVENTS_STREAM_PATH = "/api/webhooks/events/stream";
const MAX_BUFFERED_BYTES = 1_000_000;

const wss = new WebSocketServer({ noServer: true });
const clients = new Set<WebSocket>();

export function isWebhookEventsStreamRequest(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url, "http://localhost").pathname === WEBHOOK_EVENTS_STREAM_PATH;
  } catch {
    return false;
  }
}

export function formatWebhookStreamEvent(type: string, payload: unknown): string {
  return JSON.stringify({ type, payload });
}

export function isWebhookEventsStreamAuthorized(req: IncomingMessage): boolean {
  const token = tokenFromRequest(req);
  if (!token) return false;
  return validateApiToken(new Headers({ Authorization: `Bearer ${token}` }));
}

export function activeWebhookEventsStreamCount(): number {
  return clients.size;
}

export async function handleWebhookEventsStreamUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): Promise<void> {
  if (!isWebhookEventsStreamAuthorized(req)) {
    log.warn({ msg: "webhook_events_stream_auth_failed" });
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  await new Promise<void>((resolve) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      ws.on("close", () => clients.delete(ws));
      ws.on("error", (err) => {
        log.warn({ err, msg: "webhook_events_stream_client_error" });
        clients.delete(ws);
      });
      sendSnapshot(ws);
      resolve();
    });
  });
}

function tokenFromRequest(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    return url.searchParams.get("apiToken");
  } catch {
    return null;
  }
}

export function broadcastWebhookEventsChanged(): void {
  const payload = readWebhookEventsStreamSnapshot();
  for (const ws of clients) {
    safeSend(ws, "webhook_events_snapshot_updated", payload);
  }
}

function sendSnapshot(ws: WebSocket): void {
  safeSend(ws, "webhook_events_snapshot", readWebhookEventsStreamSnapshot());
}

export function readWebhookEventsStreamSnapshot(): unknown {
  try {
    const entries = listWebhookLogEntries(getDb(), { limit: 50 });
    return {
      generatedAt: new Date().toISOString(),
      entries: entries.map(webhookStreamEntry),
      counts: summarizeWebhookStreamEntries(entries),
    };
  } catch (err) {
    log.warn({ err, msg: "webhook_events_stream_snapshot_failed" });
    return {
      generatedAt: new Date().toISOString(),
      entries: [],
      counts: summarizeWebhookStreamEntries([]),
      error: "Webhook event stream snapshot failed",
    };
  }
}

export type WebhookStreamEntry = Omit<WebhookLogEntry, "payloadJson"> & {
  payloadRetained: boolean;
  payloadSize: number | null;
};

export function webhookStreamEntry(entry: WebhookLogEntry): WebhookStreamEntry {
  const { payloadJson: _payloadJson, ...safeEntry } = entry;
  return {
    ...safeEntry,
    payloadRetained: typeof entry.payloadJson === "string" && entry.payloadJson.length > 0,
    payloadSize: entry.payloadJson?.length ?? null,
  };
}

export function summarizeWebhookStreamEntries(
  entries: Array<{ result?: string | null }>,
): Record<string, number> {
  const counts: Record<string, number> = {
    total: entries.length,
    fired: 0,
    debouncing: 0,
    processing: 0,
    gated: 0,
    dropped: 0,
    failed: 0,
    received: 0,
  };
  for (const entry of entries) {
    if (entry.result && entry.result in counts) counts[entry.result] += 1;
  }
  return counts;
}

function safeSend(ws: WebSocket, type: string, payload: unknown): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
    log.warn({
      msg: "webhook_events_stream_backpressure_drop",
      bufferedAmount: ws.bufferedAmount,
    });
    return false;
  }
  ws.send(formatWebhookStreamEvent(type, payload));
  return true;
}
