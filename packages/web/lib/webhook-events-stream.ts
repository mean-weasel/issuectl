import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { getDb, listWebhookLogEntries } from "@issuectl/core";
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

export function activeWebhookEventsStreamCount(): number {
  return clients.size;
}

export async function handleWebhookEventsStreamUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): Promise<void> {
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

export function broadcastWebhookEventsChanged(): void {
  const payload = readSnapshotPayload();
  for (const ws of clients) {
    safeSend(ws, "webhook_events_changed", payload);
  }
}

function sendSnapshot(ws: WebSocket): void {
  safeSend(ws, "webhook_events_snapshot", readSnapshotPayload());
}

function readSnapshotPayload(): unknown {
  try {
    return {
      generatedAt: new Date().toISOString(),
      entries: listWebhookLogEntries(getDb(), { limit: 50 }),
    };
  } catch (err) {
    log.warn({ err, msg: "webhook_events_stream_snapshot_failed" });
    return {
      generatedAt: new Date().toISOString(),
      entries: [],
      error: "Webhook event stream snapshot failed",
    };
  }
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
