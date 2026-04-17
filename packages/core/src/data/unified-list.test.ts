import { describe, it, expect } from "vitest";
import type {
  Draft,
  Repo,
  IssuePriority,
  Deployment,
} from "../types.js";
import type { GitHubIssue } from "../github/types.js";
import { groupIntoSections } from "./unified-list.js";

const repo: Repo = {
  id: 1,
  owner: "neonwatty",
  name: "api",
  localPath: null,
  branchPattern: null,
  createdAt: "2026-01-01",
};

function makeIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 1,
    title: "Test issue",
    body: "",
    state: "open",
    labels: [],
    user: null,
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    closedAt: null,
    htmlUrl: "https://github.com/neonwatty/api/issues/1",
    ...overrides,
  };
}

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "draft-" + Math.random().toString(36).slice(2, 8),
    title: "Draft",
    body: "",
    priority: "normal",
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeDeployment(issueNumber: number, ended = false): Deployment {
  return {
    id: issueNumber * 10,
    repoId: repo.id,
    issueNumber,
    branchName: `issue-${issueNumber}`,
    workspaceMode: "worktree",
    workspacePath: `/tmp/${issueNumber}`,
    linkedPrNumber: null,
    state: "active",
    launchedAt: "2026-04-01T00:00:00Z",
    endedAt: ended ? "2026-04-02T00:00:00Z" : null,
  };
}

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
    expect(result.in_focus).toEqual([]);
    expect(result.in_flight).toEqual([]);
    expect(result.shipped).toEqual([]);
  });

  it("puts closed issues in shipped", () => {
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
    expect(result.shipped).toHaveLength(1);
    expect(result.in_focus).toEqual([]);
  });

  it("puts open issues with an active deployment in in_flight", () => {
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
    expect(result.in_flight).toHaveLength(1);
    expect(result.in_focus).toEqual([]);
  });

  it("treats an issue with only ended deployments as in_focus", () => {
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
    expect(result.in_focus).toHaveLength(1);
    expect(result.in_flight).toEqual([]);
  });

  it("puts open issues with no deployment in in_focus", () => {
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
    expect(result.in_focus).toHaveLength(1);
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
    const item = result.in_focus[0];
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
    const item = result.in_focus[0];
    if (item.kind !== "issue") throw new Error("expected issue");
    expect(item.priority).toBe("normal");
  });

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
    const focus = result.in_focus;
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
    const shippedIssue = makeIssue({ number: 2, state: "closed" });
    const flightIssue = makeIssue({ number: 3, state: "open" });
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [openIssue, shippedIssue, flightIssue],
          deployments: [makeDeployment(3, false)],
          priorities: [],
        },
      ],
    });

    for (const item of result.in_focus) {
      if (item.kind !== "issue") throw new Error("expected issue");
      expect(item.section).toBe("in_focus");
    }
    for (const item of result.in_flight) {
      if (item.kind !== "issue") throw new Error("expected issue");
      expect(item.section).toBe("in_flight");
    }
    for (const item of result.shipped) {
      if (item.kind !== "issue") throw new Error("expected issue");
      expect(item.section).toBe("shipped");
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

    expect(result.in_focus).toHaveLength(3);
    // Verify both repos are represented by looking at the item.repo.name
    const repoNames = result.in_focus.map((item) => {
      if (item.kind !== "issue") throw new Error("expected issue");
      return item.repo.name;
    });
    expect(repoNames).toContain("api");
    expect(repoNames).toContain("web");
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

    for (const item of result.in_focus) {
      if (item.kind !== "issue") throw new Error("expected issue");
      if (item.repo.name === "api") {
        expect(item.priority).toBe("normal");
      } else if (item.repo.name === "web") {
        expect(item.priority).toBe("high");
      }
    }
  });

  it("a closed issue with an active deployment still lands in shipped", () => {
    // Precedence test: closed → shipped wins over active deployment → in_flight.
    // Pins the branch order in groupIntoSections so a future refactor can't
    // silently move closed-with-deployment issues into in_flight.
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
    expect(result.shipped).toHaveLength(1);
    expect(result.in_flight).toHaveLength(0);
  });

  it("handles empty input cleanly", () => {
    const result = groupIntoSections({ drafts: [], perRepo: [] });
    expect(result.unassigned).toEqual([]);
    expect(result.in_focus).toEqual([]);
    expect(result.in_flight).toEqual([]);
    expect(result.shipped).toEqual([]);
  });
});
