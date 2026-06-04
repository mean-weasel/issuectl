import { describe, it, expect } from "vitest";
import type { Repo, IssuePriority } from "../types.js";
import { groupIntoSections } from "./unified-list.js";
import { makeDeployment, makeDraft, makeIssue, repo } from "./unified-list-test-helpers.js";

describe("groupIntoSections sorting and multi-repo behavior", () => {
  it("sorts within each section by priority DESC then updatedAt DESC", () => {
    const older = makeIssue({ number: 1, updatedAt: "2026-04-01T00:00:00Z" });
    const newer = makeIssue({ number: 2, updatedAt: "2026-04-05T00:00:00Z" });
    const highOlder = makeIssue({
      number: 3,
      updatedAt: "2026-03-01T00:00:00Z",
    });
    const priorities: IssuePriority[] = [
      { repoId: repo.id, issueNumber: 3, priority: "high", updatedAt: 0 },
    ];
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [older, newer, highOlder],
          deployments: [],
          priorities,
        },
      ],
    }, "priority");
    const focus = result.open;
    expect(focus).toHaveLength(3);
    if (focus[0].kind !== "issue") throw new Error("expected issue");
    if (focus[1].kind !== "issue") throw new Error("expected issue");
    if (focus[2].kind !== "issue") throw new Error("expected issue");
    expect(focus[0].issue.number).toBe(3);
    expect(focus[1].issue.number).toBe(2);
    expect(focus[2].issue.number).toBe(1);
  });

  it("sorts drafts by priority DESC then updatedAt DESC, including low", () => {
    const lowest = makeDraft({ title: "A", priority: "low", updatedAt: 500 });
    const normalOlder = makeDraft({ title: "B", priority: "normal", updatedAt: 100 });
    const normalNewer = makeDraft({ title: "C", priority: "normal", updatedAt: 200 });
    const high = makeDraft({ title: "D", priority: "high", updatedAt: 50 });
    const result = groupIntoSections({
      drafts: [lowest, normalOlder, normalNewer, high],
      perRepo: [],
    }, "priority");
    const titles = result.unassigned.map((item) => {
      if (item.kind !== "draft") throw new Error("expected draft");
      return item.draft.title;
    });
    // high first, then normal newer, then normal older, then low last
    expect(titles).toEqual(["D", "C", "B", "A"]);
  });

  it("item.section matches the bucket an issue lands in", () => {
    const openIssue = makeIssue({ number: 1, state: "open" });
    const closedIssue = makeIssue({ number: 2, state: "closed" });
    const runningIssue = makeIssue({ number: 3, state: "open" });
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [openIssue, closedIssue, runningIssue],
          deployments: [makeDeployment(3, false)],
          priorities: [],
        },
      ],
    });

    for (const item of result.open) {
      if (item.kind !== "issue") throw new Error("expected issue");
      expect(item.section).toBe("open");
    }
    for (const item of result.running) {
      if (item.kind !== "issue") throw new Error("expected issue");
      expect(item.section).toBe("running");
    }
    for (const item of result.closed) {
      if (item.kind !== "issue") throw new Error("expected issue");
      expect(item.section).toBe("closed");
    }
  });

  it("aggregates issues across multiple tracked repos", () => {
    const apiRepo = repo;
    const webRepo: Repo = { ...repo, id: 2, name: "web" };

    const apiIssue1 = makeIssue({ number: 1, title: "api bug" });
    const apiIssue2 = makeIssue({ number: 2, title: "api feat" });
    const webIssue1 = makeIssue({ number: 1, title: "web bug" });

    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo: apiRepo,
          issues: [apiIssue1, apiIssue2],
          deployments: [],
          priorities: [],
        },
        {
          repo: webRepo,
          issues: [webIssue1],
          deployments: [],
          priorities: [],
        },
      ],
    });

    expect(result.open).toHaveLength(3);
    // Verify both repos are represented by looking at the item.repo.name
    const repoNames = result.open.map((item) => {
      if (item.kind !== "issue") throw new Error("expected issue");
      return item.repo.name;
    });
    expect(repoNames).toContain("api");
    expect(repoNames).toContain("web");
  });

  it("preserves owner identity when different owners share the same repo name", () => {
    const meanWebRepo: Repo = { ...repo, id: 10, owner: "mean-weasel", name: "web" };
    const paperWebRepo: Repo = { ...repo, id: 11, owner: "paper-owl", name: "web" };

    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo: meanWebRepo,
          issues: [makeIssue({ number: 440, title: "mean web issue" })],
          deployments: [],
          priorities: [],
        },
        {
          repo: paperWebRepo,
          issues: [makeIssue({ number: 440, title: "paper web issue" })],
          deployments: [],
          priorities: [],
        },
      ],
    });

    const identities = result.open.map((item) => {
      if (item.kind !== "issue") throw new Error("expected issue");
      return `${item.repo.owner}/${item.repo.name}#${item.issue.number}`;
    });
    expect(identities).toContain("mean-weasel/web#440");
    expect(identities).toContain("paper-owl/web#440");
  });

  it("does not confuse priority rows across repos with the same issue number", () => {
    // Regression guard: the priority map must be scoped to the repo.
    // If the impl ever keys by issueNumber alone, the api-repo issue #1
    // would wrongly inherit the web-repo #1's "high" priority.
    const apiRepo = repo;
    const webRepo: Repo = { ...repo, id: 2, name: "web" };

    const apiIssue1 = makeIssue({ number: 1, title: "api" });
    const webIssue1 = makeIssue({ number: 1, title: "web" });

    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo: apiRepo,
          issues: [apiIssue1],
          deployments: [],
          priorities: [], // api #1 has no explicit priority → normal
        },
        {
          repo: webRepo,
          issues: [webIssue1],
          deployments: [],
          priorities: [
            { repoId: webRepo.id, issueNumber: 1, priority: "high", updatedAt: 0 },
          ],
        },
      ],
    });

    for (const item of result.open) {
      if (item.kind !== "issue") throw new Error("expected issue");
      if (item.repo.name === "api") {
        expect(item.priority).toBe("normal");
      } else if (item.repo.name === "web") {
        expect(item.priority).toBe("high");
      }
    }
  });

  it("a closed issue with an active deployment still lands in closed", () => {
    // Precedence test: closed → closed wins over active deployment → running.
    // Pins the branch order in groupIntoSections so a future refactor can't
    // silently move closed-with-deployment issues into running.
    const issue = makeIssue({ number: 7, state: "closed" });
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [issue],
          deployments: [makeDeployment(7, false)], // active
          priorities: [],
        },
      ],
    });
    expect(result.closed).toHaveLength(1);
    expect(result.running).toHaveLength(0);
  });

  it("handles empty input cleanly", () => {
    const result = groupIntoSections({ drafts: [], perRepo: [] });
    expect(result.unassigned).toEqual([]);
    expect(result.open).toEqual([]);
    expect(result.running).toEqual([]);
    expect(result.closed).toEqual([]);
  });
});
