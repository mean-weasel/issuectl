import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  enqueue,
  listPending,
  listFailed,
  markSyncing,
  markFailed,
  markPending,
  remove,
  clearAll,
} from "./offline-queue";

beforeEach(async () => {
  await clearAll();
});

describe("offline-queue", () => {
  it("enqueues an operation and lists it as pending", async () => {
    const op = await enqueue("addComment", {
      owner: "acme",
      repo: "api",
      issueNumber: 47,
      body: "hello",
    }, "nonce-1");

    expect(op.id).toBeDefined();
    expect(op.action).toBe("addComment");
    expect(op.status).toBe("pending");
    expect(op.nonce).toBe("nonce-1");

    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(op.id);
  });

  it("lists pending operations ordered by createdAt", async () => {
    await enqueue("addComment", { body: "first" }, "n1");
    await enqueue("toggleLabel", { label: "bug" }, "n2");

    const pending = await listPending();
    expect(pending).toHaveLength(2);
    expect(pending[0].action).toBe("addComment");
    expect(pending[1].action).toBe("toggleLabel");
  });

  it("supports replayable issue actions", async () => {
    await enqueue("closeIssue", { owner: "acme", repo: "api", issueNumber: 47 }, "n1");
    await enqueue("setPriority", { repoId: 1, issueNumber: 47, priority: "high" }, "n2");

    const pending = await listPending();
    expect(pending.map((op) => op.action)).toEqual(["closeIssue", "setPriority"]);
  });

  it("marks an operation as syncing", async () => {
    const op = await enqueue("assignDraft", { draftId: "d1" }, "n1");
    await markSyncing(op.id);

    const pending = await listPending();
    expect(pending).toHaveLength(0);
  });

  it("marks an operation as failed with error", async () => {
    const op = await enqueue("addComment", { body: "x" }, "n1");
    await markSyncing(op.id);
    await markFailed(op.id, "Repo not found");

    const failed = await listFailed();
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toBe("Repo not found");
    expect(failed[0].attemptedAt).toBeDefined();
  });

  it("reverts a syncing operation back to pending", async () => {
    const op = await enqueue("addComment", { body: "x" }, "n1");
    await markSyncing(op.id);
    await markPending(op.id);

    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe("pending");
  });

  it("removes an operation from the queue", async () => {
    const op = await enqueue("addComment", { body: "x" }, "n1");
    await remove(op.id);

    const pending = await listPending();
    expect(pending).toHaveLength(0);
  });

  it("clearAll removes everything", async () => {
    await enqueue("addComment", { body: "a" }, "n1");
    await enqueue("toggleLabel", { label: "b" }, "n2");
    await clearAll();

    const pending = await listPending();
    expect(pending).toHaveLength(0);
  });
});
