import { describe, expect, it } from "vitest";
import {
  formatWebhookStreamEvent,
  isWebhookEventsStreamRequest,
} from "./webhook-events-stream";

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
});
