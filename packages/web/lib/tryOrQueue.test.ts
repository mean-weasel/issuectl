import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { tryOrQueue } from "./tryOrQueue";
import { clearAll, listPending } from "./offline-queue";

beforeEach(async () => {
  await clearAll();
});

describe("tryOrQueue", () => {
  it("returns succeeded when server action succeeds", async () => {
    const action = vi.fn().mockResolvedValue({ success: true, issueNumber: 1 });

    const result = await tryOrQueue("addComment", { body: "hi" }, action);

    expect(result.outcome).toBe("succeeded");
    expect(action).toHaveBeenCalled();
    const pending = await listPending();
    expect(pending).toHaveLength(0);
  });

  it("queues when navigator.onLine is false", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const action = vi.fn();

    const result = await tryOrQueue("addComment", { body: "hi" }, action);

    expect(result.outcome).toBe("queued");
    expect(action).not.toHaveBeenCalled();
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].action).toBe("addComment");

    vi.unstubAllGlobals();
  });

  it("queues when server action throws TypeError (fetch failure)", async () => {
    const action = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await tryOrQueue("addComment", { body: "hi" }, action);

    expect(result.outcome).toBe("queued");
    const pending = await listPending();
    expect(pending).toHaveLength(1);
  });

  it("queues when server returns network error", async () => {
    const action = vi.fn().mockResolvedValue({
      success: false,
      error: "Network error — GitHub is unreachable",
    });

    const result = await tryOrQueue(
      "addComment",
      { body: "hi" },
      action,
      { isNetworkError: (e) => e.includes("Network error") },
    );

    expect(result.outcome).toBe("queued");
    const pending = await listPending();
    expect(pending).toHaveLength(1);
  });

  it("returns error for non-network server failures", async () => {
    const action = vi.fn().mockResolvedValue({
      success: false,
      error: "Validation failed: title is required",
    });

    const result = await tryOrQueue("addComment", { body: "hi" }, action);

    expect(result.outcome).toBe("error");
    if (result.outcome === "error") {
      expect(result.error).toBe("Validation failed: title is required");
    }
    const pending = await listPending();
    expect(pending).toHaveLength(0);
  });

  it("uses provided nonce instead of generating one", async () => {
    vi.stubGlobal("navigator", { onLine: false });

    await tryOrQueue("assignDraft", { draftId: "d1" }, vi.fn(), {
      nonce: "existing-nonce",
    });

    const pending = await listPending();
    expect(pending[0].nonce).toBe("existing-nonce");

    vi.unstubAllGlobals();
  });
});
