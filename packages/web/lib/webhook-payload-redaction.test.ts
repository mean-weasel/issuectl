import { describe, expect, it } from "vitest";
import { redactWebhookPayload } from "./webhook-payload-redaction";

describe("redactWebhookPayload", () => {
  it("redacts common secret, token, body, and comment fields from JSON payloads", () => {
    const redacted = redactWebhookPayload(JSON.stringify({
      action: "created",
      hook: { secret: "webhook-secret" },
      installation: { token: "ghp_1234567890abcdef" },
      issue: { number: 506, body: "private issue text" },
      comment: { body: "private comment text" },
      pull_request: { head: { sha: "abc123" } },
    }));

    expect(JSON.parse(redacted)).toEqual({
      action: "created",
      hook: { secret: "[redacted]" },
      installation: { token: "[redacted]" },
      issue: { number: 506, body: "[redacted]" },
      comment: "[redacted]",
      pull_request: { head: { sha: "abc123" } },
    });
    expect(redacted).not.toContain("webhook-secret");
    expect(redacted).not.toContain("private issue text");
    expect(redacted).not.toContain("private comment text");
  });

  it("redacts token-like values from non-JSON payload previews", () => {
    expect(redactWebhookPayload("token=github_pat_1234567890 secret=abc")).toBe(
      "token=[redacted] secret=[redacted]",
    );
  });
});
