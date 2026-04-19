import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { enqueue, clearAll, listPending, listFailed } from "./offline-queue";
import { replayQueue } from "./sync";

beforeEach(async () => {
  await clearAll();
});

describe("replayQueue", () => {
  it("does nothing when queue is empty", async () => {
    const executor = vi.fn();
    const result = await replayQueue(executor);
    expect(result).toEqual({ synced: 0, failed: 0, stopped: false });
    expect(executor).not.toHaveBeenCalled();
  });

  it("replays pending operations and removes on success", async () => {
    await enqueue("addComment", { body: "hello" }, "n1");
    await enqueue("toggleLabel", { label: "bug" }, "n2");

    const executor = vi.fn().mockResolvedValue({ success: true });
    const result = await replayQueue(executor);

    expect(result).toEqual({ synced: 2, failed: 0, stopped: false });
    expect(executor).toHaveBeenCalledTimes(2);

    const pending = await listPending();
    expect(pending).toHaveLength(0);
  });

  it("stops on network error and reverts to pending", async () => {
    await enqueue("addComment", { body: "a" }, "n1");
    await enqueue("toggleLabel", { label: "b" }, "n2");

    const executor = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await replayQueue(executor);

    expect(result).toEqual({ synced: 0, failed: 0, stopped: true });
    expect(executor).toHaveBeenCalledTimes(1);

    const pending = await listPending();
    expect(pending).toHaveLength(2);
  });

  it("marks non-network failures and continues", async () => {
    await enqueue("addComment", { body: "a" }, "n1");
    await enqueue("toggleLabel", { label: "b" }, "n2");

    const executor = vi.fn()
      .mockResolvedValueOnce({ success: false, error: "Repo not found" })
      .mockResolvedValueOnce({ success: true });

    const result = await replayQueue(executor);

    expect(result).toEqual({ synced: 1, failed: 1, stopped: false });

    const failed = await listFailed();
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toBe("Repo not found");

    const pending = await listPending();
    expect(pending).toHaveLength(0);
  });
});
