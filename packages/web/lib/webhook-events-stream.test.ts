import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import {
  formatWebhookStreamEvent,
  isWebhookEventsStreamAuthorized,
  isWebhookEventsStreamRequest,
  summarizeWebhookStreamEntries,
} from "./webhook-events-stream";

vi.mock("./api-auth", () => ({
  validateApiToken: (headers: Headers) => headers.get("Authorization") === "Bearer valid-token",
}));

describe("webhook events stream helpers", () => {
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
});

function makeRequest(url: string, authorization?: string): IncomingMessage {
  return {
    url,
    headers: authorization ? { authorization } : {},
  } as IncomingMessage;
}
