import { describe, it, expect } from "vitest";
import type { IssuePriority } from "../types.js";
import { groupIntoSections } from "./unified-list.js";
import { makeDeployment, makeDraft, makeIssue, repo } from "./unified-list-test-helpers.js";

describe("groupIntoSections", () => {
  it("puts drafts in the unassigned section", () => {
    const d1 = makeDraft({ title: "First" });
    const d2 = makeDraft({ title: "Second" });
    const result = groupIntoSections({
      drafts: [d1, d2],
      perRepo: [],
    });
    expect(result.unassigned).toHaveLength(2);
    expect(result.unassigned.every((item) => item.kind === "draft")).toBe(true);
    expect(result.open).toEqual([]);
    expect(result.running).toEqual([]);
    expect(result.closed).toEqual([]);
  });

  it("puts closed issues in closed", () => {
    const closed = makeIssue({ number: 1, state: "closed" });
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [closed],
          deployments: [],
          priorities: [],
        },
      ],
    });
    expect(result.closed).toHaveLength(1);
    expect(result.open).toEqual([]);
  });

  it("puts open issues with an active deployment in running", () => {
    const issue = makeIssue({ number: 2 });
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [issue],
          deployments: [makeDeployment(2, false)],
          priorities: [],
        },
      ],
    });
    expect(result.running).toHaveLength(1);
    expect(result.open).toEqual([]);
  });

  it("propagates idleSince to running items and omits it from open items", () => {
    const runningIssue = makeIssue({ number: 5 });
    const openIssue = makeIssue({ number: 6 });
    const idleDep = { ...makeDeployment(5, false), idleSince: "2026-04-25T00:00:00Z" };
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [runningIssue, openIssue],
          deployments: [idleDep],
          priorities: [],
        },
      ],
    });
    expect(result.running).toHaveLength(1);
    const runningItem = result.running[0];
    if (runningItem.kind !== "issue") throw new Error("expected issue");
    expect(runningItem.idleSince).toBe("2026-04-25T00:00:00Z");

    expect(result.open).toHaveLength(1);
    const openItem = result.open[0];
    if (openItem.kind !== "issue") throw new Error("expected issue");
    expect(openItem.idleSince).toBeUndefined();
  });

  it("treats an issue with only ended deployments as open", () => {
    const issue = makeIssue({ number: 3 });
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [issue],
          deployments: [makeDeployment(3, true)],
          priorities: [],
        },
      ],
    });
    expect(result.open).toHaveLength(1);
    expect(result.running).toEqual([]);
  });

  it("puts open issues with no deployment in open", () => {
    const issue = makeIssue({ number: 4 });
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [issue],
          deployments: [],
          priorities: [],
        },
      ],
    });
    expect(result.open).toHaveLength(1);
  });

  it("enriches issues with their priority from the repo's priority map", () => {
    const issue = makeIssue({ number: 5 });
    const priorities: IssuePriority[] = [
      {
        repoId: repo.id,
        issueNumber: 5,
        priority: "high",
        updatedAt: 1000,
      },
    ];
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [issue],
          deployments: [],
          priorities,
        },
      ],
    });
    const item = result.open[0];
    if (item.kind !== "issue") throw new Error("expected issue");
    expect(item.priority).toBe("high");
  });

  it("defaults issues with no priority row to 'normal'", () => {
    const issue = makeIssue({ number: 6 });
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [issue],
          deployments: [],
          priorities: [],
        },
      ],
    });
    const item = result.open[0];
    if (item.kind !== "issue") throw new Error("expected issue");
    expect(item.priority).toBe("normal");
  });

});
