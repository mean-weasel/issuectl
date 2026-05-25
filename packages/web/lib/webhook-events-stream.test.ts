import { afterEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import {
  activeWebhookEventsStreamCount,
  broadcastWebhookEventsChanged,
  formatWebhookStreamEvent,
  handleWebhookEventsStreamUpgrade,
  isWebhookEventsStreamAuthorized,
  isWebhookEventsStreamRequest,
  readWebhookEventsStreamSnapshot,
  summarizeWebhookStreamEntries,
} from "./webhook-events-stream";

const getDb = vi.hoisted(() => vi.fn(() => ({})));
const listWebhookLogEntries = vi.hoisted(() => vi.fn());
const wsState = vi.hoisted(() => ({
  latestSocket: null as null | {
    readyState: number;
    bufferedAmount: number;
    send: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    handlers: Map<string, () => void>;
  },
}));

vi.mock("./api-auth", () => ({
  validateApiToken: (headers: Headers) => headers.get("Authorization") === "Bearer valid-token",
}));

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  listWebhookLogEntries: (...args: unknown[]) => listWebhookLogEntries(...args),
}));

vi.mock("ws", () => {
  const OPEN = 1;
  return {
    WebSocket: { OPEN },
    WebSocketServer: class {
      handleUpgrade(
        _req: IncomingMessage,
        _socket: Duplex,
        _head: Buffer,
        callback: (ws: typeof wsState.latestSocket) => void,
      ) {
        const handlers = new Map<string, () => void>();
        const ws = {
          readyState: OPEN,
          bufferedAmount: 0,
          send: vi.fn(),
          on: vi.fn((event: string, handler: () => void) => {
            handlers.set(event, handler);
          }),
          handlers,
        };
        wsState.latestSocket = ws;
        callback(ws);
      }
    },
  };
});

describe("webhook events stream helpers", () => {
  afterEach(() => {
    listWebhookLogEntries.mockReset();
    wsState.latestSocket = null;
  });

  it("matches only the webhook events stream upgrade path", () => {
    expect(isWebhookEventsStreamRequest("/api/webhooks/events/stream")).toBe(true);
    expect(isWebhookEventsStreamRequest("/api/webhooks/events/stream?repo=2")).toBe(true);
    expect(isWebhookEventsStreamRequest("/api/webhooks/events")).toBe(false);
    expect(isWebhookEventsStreamRequest("/api/terminal/3847/ws")).toBe(false);
  });

  it("formats stream payloads as JSON messages", () => {
    expect(
      formatWebhookStreamEvent("webhook_event_created", {
        id: 1,
        deliveryId: "delivery-1",
      }),
    ).toBe(
      JSON.stringify({
        type: "webhook_event_created",
        payload: { id: 1, deliveryId: "delivery-1" },
      }),
    );
  });

  it("requires the dashboard API token for stream upgrades", () => {
    expect(isWebhookEventsStreamAuthorized(makeRequest("/api/webhooks/events/stream?apiToken=valid-token"))).toBe(true);
    expect(isWebhookEventsStreamAuthorized(makeRequest("/api/webhooks/events/stream", "Bearer valid-token"))).toBe(true);
    expect(isWebhookEventsStreamAuthorized(makeRequest("/api/webhooks/events/stream"))).toBe(false);
    expect(isWebhookEventsStreamAuthorized(makeRequest("/api/webhooks/events/stream?apiToken=wrong-token"))).toBe(false);
  });

  it("summarizes stream snapshots by webhook result", () => {
    expect(summarizeWebhookStreamEntries([
      { result: "fired" },
      { result: "debouncing" },
      { result: "debouncing" },
      { result: "failed" },
      { result: "unknown" },
      {},
    ])).toEqual({
      total: 6,
      fired: 1,
      debouncing: 2,
      processing: 0,
      gated: 0,
      dropped: 0,
      failed: 1,
      received: 0,
    });
  });

  it("builds stream snapshots from webhook log entries", () => {
    listWebhookLogEntries.mockReturnValue([
      { id: 1, deliveryId: "delivery-1", result: "debouncing" },
      { id: 2, deliveryId: "delivery-2", result: "fired" },
    ]);

    expect(readWebhookEventsStreamSnapshot()).toMatchObject({
      entries: [
        { id: 1, deliveryId: "delivery-1", result: "debouncing" },
        { id: 2, deliveryId: "delivery-2", result: "fired" },
      ],
      counts: { total: 2, fired: 1, debouncing: 1 },
    });
    expect(listWebhookLogEntries).toHaveBeenCalledWith({}, { limit: 50 });
  });

  it("returns an empty snapshot payload when the DB read fails", () => {
    listWebhookLogEntries.mockImplementation(() => {
      throw new Error("db unavailable");
    });

    expect(readWebhookEventsStreamSnapshot()).toMatchObject({
      entries: [],
      counts: { total: 0 },
      error: "Webhook event stream snapshot failed",
    });
  });

  it("sends an initial snapshot, broadcasts changes, and removes closed upgrade clients", async () => {
    listWebhookLogEntries.mockReturnValue([
      { id: 1, deliveryId: "delivery-1", result: "fired" },
    ]);

    await handleWebhookEventsStreamUpgrade(
      makeRequest("/api/webhooks/events/stream", "Bearer valid-token"),
      fakeSocket(),
      Buffer.alloc(0),
    );

    const ws = wsState.latestSocket;
    expect(ws).not.toBeNull();
    expect(activeWebhookEventsStreamCount()).toBe(1);
    expect(ws?.send).toHaveBeenCalledWith(expect.stringContaining("webhook_events_snapshot"));
    expect(ws?.send).toHaveBeenCalledWith(expect.stringContaining("delivery-1"));

    broadcastWebhookEventsChanged();

    expect(ws?.send).toHaveBeenCalledWith(expect.stringContaining("webhook_events_changed"));

    ws?.handlers.get("close")?.();

    expect(activeWebhookEventsStreamCount()).toBe(0);
  });

});

function makeRequest(url: string, authorization?: string): IncomingMessage {
  return {
    url,
    headers: authorization ? { authorization } : {},
  } as IncomingMessage;
}

function fakeSocket(): Duplex {
  return {
    write: vi.fn(),
    destroy: vi.fn(),
  } as unknown as Duplex;
}
