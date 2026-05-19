import { describe, it, expect, vi, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import type { Octokit } from "@octokit/rest";
import { executeLaunch } from "./launch.js";
import { createTestDb } from "../db/test-helpers.js";
import { addRepo } from "../db/repos.js";
import { recordDeployment } from "../db/deployments.js";

// Stub every module side-effect outside the pre-check's reach so the
// test only measures ordering: did `prepareWorkspace` run even though
// a live deployment already existed? `vi.hoisted` declares the spy at
// the same time vi.mock is hoisted so the factory can reference it.
const { prepareWorkspaceSpy } = vi.hoisted(() => ({
  prepareWorkspaceSpy: vi.fn(async () => ({
    path: "/tmp/fake-workspace",
    branchName: "fake-branch",
  })),
}));

vi.mock("./workspace.js", () => ({
  prepareWorkspace: prepareWorkspaceSpy,
}));

const { verifyTtydSpy, spawnTtydSpy, allocatePortSpy } = vi.hoisted(() => ({
  verifyTtydSpy: vi.fn(),
  spawnTtydSpy: vi.fn(async () => ({ pid: 12345, port: 7700 })),
  allocatePortSpy: vi.fn(async () => 7700),
}));

vi.mock("./ttyd.js", () => ({
  verifyTtyd: verifyTtydSpy,
  spawnTtyd: spawnTtydSpy,
  allocatePort: allocatePortSpy,
  tmuxSessionName: (repo: string, issueNumber: number) =>
    `issuectl-${repo}-${issueNumber}`,
}));

const { reserveTtydPortSpy, updateTtydInfoSpy } = vi.hoisted(() => ({
  reserveTtydPortSpy: vi.fn(),
  updateTtydInfoSpy: vi.fn(),
}));

vi.mock("../db/deployments.js", async () => {
  const actual =
    await vi.importActual<typeof import("../db/deployments.js")>(
      "../db/deployments.js",
    );
  return {
    ...actual,
    reserveTtydPort: reserveTtydPortSpy,
    updateTtydInfo: updateTtydInfoSpy,
  };
});

vi.mock("../data/issues.js", () => ({
  getIssueDetail: async () => ({
    issue: {
      number: 42,
      title: "test issue",
      body: "",
      state: "open",
      labels: [],
      user: null,
      commentCount: 0,
      createdAt: "2026-04-12T00:00:00Z",
      updatedAt: "2026-04-12T00:00:00Z",
      closedAt: null,
      htmlUrl: "https://example.invalid",
    },
    comments: [],
    referencedFiles: [],
  }),
}));

vi.mock("./context.js", () => ({
  assembleContext: () => "fake context",
  writeContextFile: async () => "/tmp/fake-context.md",
}));

vi.mock("../github/labels.js", async () => {
  const actual =
    await vi.importActual<typeof import("../github/labels.js")>(
      "../github/labels.js",
    );
  return {
    ...actual,
    ensureLifecycleLabels: async () => {},
    addLabel: async () => {},
    addLabels: async () => {},
    removeLabel: async () => {},
  };
});

describe("executeLaunch duplicate-deployment pre-check", () => {
  let db: Database.Database;

  beforeEach(() => {
    prepareWorkspaceSpy.mockClear();
    verifyTtydSpy.mockClear();
    spawnTtydSpy.mockClear();
    allocatePortSpy.mockClear();
    reserveTtydPortSpy.mockClear();
    updateTtydInfoSpy.mockClear();
    db = createTestDb();
  });

  it("allows launch when the prior deployment has ended", async () => {
    const repo = addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });
    const prior = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 42,
      branchName: "prior-branch",
      workspaceMode: "existing",
      workspacePath: "/tmp/prior-workspace",
    });
    // End the prior session so the live-unique index releases the slot
    db.prepare(
      "UPDATE deployments SET ended_at = datetime('now') WHERE id = ?",
    ).run(prior.id);

    const result = await executeLaunch(db, {} as Octokit, {
      owner: "acme",
      repo: "api",
      issueNumber: 42,
      branchName: "new-branch",
      workspaceMode: "existing",
      selectedComments: [],
      selectedFiles: [],
    });

    expect(prepareWorkspaceSpy).toHaveBeenCalledTimes(1);
    expect(spawnTtydSpy).toHaveBeenCalledTimes(1);
    expect(spawnTtydSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 7700,
        workspacePath: "/tmp/fake-workspace",
        agentCommand: "claude",
        agentInputMode: "stdin",
        sessionName: "issuectl-api-42",
      }),
    );
    expect(updateTtydInfoSpy).toHaveBeenCalledWith(
      db,
      expect.any(Number),
      7700,
      12345,
    );
    expect(result.ttydPort).toBe(7700);
  });

  it("launches codex when launch_agent is set", async () => {
    const repo = addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "launch_agent",
      "codex",
    );
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "codex_extra_args",
      "--model gpt-5 --full-auto",
    );

    await executeLaunch(db, {} as Octokit, {
      owner: "acme",
      repo: "api",
      issueNumber: 43,
      branchName: "codex-branch",
      workspaceMode: "existing",
      selectedComments: [],
      selectedFiles: [],
    });

    expect(spawnTtydSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        agentCommand: "codex --model gpt-5 --full-auto",
        agentInputMode: "argument",
      }),
    );
    const row = db
      .prepare("SELECT agent FROM deployments WHERE repo_id = ? AND issue_number = ?")
      .get(repo.id, 43) as { agent: string };
    expect(row.agent).toBe("codex");
  });

  it("uses an explicit launch agent over the saved default", async () => {
    const repo = addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "launch_agent",
      "claude",
    );
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "codex_extra_args",
      "--sandbox danger-full-access --ask-for-approval never",
    );

    await executeLaunch(db, {} as Octokit, {
      owner: "acme",
      repo: "api",
      issueNumber: 44,
      agent: "codex",
      branchName: "codex-override",
      workspaceMode: "existing",
      selectedComments: [],
      selectedFiles: [],
    });

    expect(spawnTtydSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        agentCommand: "codex --sandbox danger-full-access --ask-for-approval never",
        agentInputMode: "argument",
      }),
    );
    const row = db
      .prepare("SELECT agent FROM deployments WHERE repo_id = ? AND issue_number = ?")
      .get(repo.id, 44) as { agent: string };
    expect(row.agent).toBe("codex");
  });
});
