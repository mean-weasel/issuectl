import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import {
  formatWebhookStreamEvent,
  isWebhookEventsStreamAuthorized,
  isWebhookEventsStreamRequest,
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
});

function makeRequest(url: string, authorization?: string): IncomingMessage {
  return {
    url,
    headers: authorization ? { authorization } : {},
  } as IncomingMessage;
}
