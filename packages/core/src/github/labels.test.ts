import { describe, it, expect, vi } from "vitest";
import type { Octokit } from "@octokit/rest";
import {
  listLabels,
  addLabel,
  removeLabel,
  ensureLifecycleLabels,
  LIFECYCLE_LABEL,
} from "./labels.js";

/* ---------- helpers ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = ReturnType<typeof vi.fn<(...args: any[]) => any>>;

function makeOctokit() {
  const paginate = vi.fn() as MockFn;
  const getLabel = vi.fn() as MockFn;
  const createLabel = vi.fn() as MockFn;
  const addLabels = vi.fn() as MockFn;
  const removeLabelFn = vi.fn() as MockFn;
  const listLabelsForRepo = vi.fn() as MockFn;

  const octokit = {
    paginate,
    rest: {
      issues: {
        getLabel,
        createLabel,
        addLabels,
        removeLabel: removeLabelFn,
        listLabelsForRepo,
      },
    },
  } as unknown as Octokit;

  return { octokit, paginate, getLabel, createLabel, addLabels, removeLabelFn, listLabelsForRepo };
}

/* ---------- listLabels ---------- */

describe("listLabels", () => {
  it("returns mapped labels", async () => {
    const { octokit, paginate } = makeOctokit();
    paginate.mockResolvedValue([
      { name: "bug", color: "d73a4a", description: "Bug" },
      { name: "feature", color: "0e8a16", description: null },
    ]);

    const labels = await listLabels(octokit, "owner", "repo");
    expect(labels).toHaveLength(2);
    expect(labels[0]).toEqual({ name: "bug", color: "d73a4a", description: "Bug" });
    expect(labels[1]).toEqual({ name: "feature", color: "0e8a16", description: null });
  });
});

/* ---------- addLabel ---------- */

describe("addLabel", () => {
  it("calls Octokit addLabels with correct params", async () => {
    const { octokit, addLabels } = makeOctokit();
    addLabels.mockResolvedValue({});

    await addLabel(octokit, "owner", "repo", 5, "bug");
    expect(addLabels).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      issue_number: 5,
      labels: ["bug"],
    });
  });
});

/* ---------- removeLabel ---------- */

describe("removeLabel", () => {
  it("calls Octokit removeLabel with correct params", async () => {
    const { octokit, removeLabelFn } = makeOctokit();
    removeLabelFn.mockResolvedValue({});

    await removeLabel(octokit, "owner", "repo", 5, "bug");
    expect(removeLabelFn).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      issue_number: 5,
      name: "bug",
    });
  });

  it("swallows 404 errors (label not found)", async () => {
    const { octokit, removeLabelFn } = makeOctokit();
    removeLabelFn.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );

    // Should not throw
    await expect(removeLabel(octokit, "owner", "repo", 5, "bug")).resolves.toBeUndefined();
  });

  it("rethrows non-404 errors", async () => {
    const { octokit, removeLabelFn } = makeOctokit();
    removeLabelFn.mockRejectedValue(
      Object.assign(new Error("Server Error"), { status: 500 }),
    );

    await expect(removeLabel(octokit, "owner", "repo", 5, "bug")).rejects.toThrow("Server Error");
  });
});

/* ---------- ensureLifecycleLabels ---------- */

describe("ensureLifecycleLabels", () => {
  it("creates missing lifecycle labels", async () => {
    const { octokit, getLabel, createLabel } = makeOctokit();
    // All labels are missing (404)
    getLabel.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );
    createLabel.mockResolvedValue({});

    await ensureLifecycleLabels(octokit, "owner", "repo");
    expect(createLabel).toHaveBeenCalledTimes(4);

    const names = createLabel.mock.calls.map(
      (call: Array<Record<string, unknown>>) => call[0].name,
    );
    expect(names).toContain(LIFECYCLE_LABEL.deployed);
    expect(names).toContain(LIFECYCLE_LABEL.inProgress);
    expect(names).toContain(LIFECYCLE_LABEL.prOpen);
    expect(names).toContain(LIFECYCLE_LABEL.done);
  });

  it("skips labels that already exist", async () => {
    const { octokit, getLabel, createLabel } = makeOctokit();
    // All labels already exist
    getLabel.mockResolvedValue({});

    await ensureLifecycleLabels(octokit, "owner", "repo");
    expect(createLabel).not.toHaveBeenCalled();
  });
});
