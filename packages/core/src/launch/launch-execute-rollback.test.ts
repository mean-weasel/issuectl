import { describe, it, expect, vi, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import type { Octokit } from "@octokit/rest";
import { executeLaunch } from "./launch.js";
import { createTestDb } from "../db/test-helpers.js";
import { addRepo } from "../db/repos.js";
import * as deploymentsModule from "../db/deployments.js";

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

  it("rolls back pending deployment when spawnTtyd fails", async () => {
    const repo = addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });

    const spawnError = new Error("ttyd process failed to start");
    spawnTtydSpy.mockRejectedValueOnce(spawnError);

    await expect(
      executeLaunch(db, {} as Octokit, {
        owner: "acme",
        repo: "api",
        issueNumber: 42,
        branchName: "new-branch",
        workspaceMode: "existing",
        selectedComments: [],
        selectedFiles: [],
      }),
    ).rejects.toThrow("ttyd process failed to start");

    // The pending deployment row must have been deleted by the rollback
    const row = db
      .prepare(
        "SELECT * FROM deployments WHERE repo_id = ? AND issue_number = 42",
      )
      .get(repo.id);
    expect(row).toBeUndefined();

    // The slot is freed — a second launch for the same issue succeeds
    spawnTtydSpy.mockResolvedValueOnce({ pid: 99999, port: 7700 });
    const result = await executeLaunch(db, {} as Octokit, {
      owner: "acme",
      repo: "api",
      issueNumber: 42,
      branchName: "retry-branch",
      workspaceMode: "existing",
      selectedComments: [],
      selectedFiles: [],
    });
    expect(result.ttydPort).toBe(7700);
  });

  it("propagates spawn error even when rollback fails", async () => {
    addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });

    const spawnError = new Error("ttyd crashed");
    spawnTtydSpy.mockRejectedValueOnce(spawnError);

    const rollbackError = new Error("DB locked during rollback");
    const deleteSpy = vi
      .spyOn(deploymentsModule, "deletePendingDeployment")
      .mockImplementationOnce(() => {
        throw rollbackError;
      });

    try {
      await expect(
        executeLaunch(db, {} as Octokit, {
          owner: "acme",
          repo: "api",
          issueNumber: 42,
          branchName: "new-branch",
          workspaceMode: "existing",
          selectedComments: [],
          selectedFiles: [],
        }),
        // Must rethrow the original spawn error, not the rollback error
      ).rejects.toThrow("ttyd crashed");
    } finally {
      deleteSpy.mockRestore();
    }
  });

  it("rolls back when allocatePort fails", async () => {
    const repo = addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });

    allocatePortSpy.mockRejectedValueOnce(new Error("no free ports"));

    await expect(
      executeLaunch(db, {} as Octokit, {
        owner: "acme",
        repo: "api",
        issueNumber: 42,
        branchName: "new-branch",
        workspaceMode: "existing",
        selectedComments: [],
        selectedFiles: [],
      }),
    ).rejects.toThrow("no free ports");

    // Pending deployment row must be gone after the rollback
    const row = db
      .prepare(
        "SELECT * FROM deployments WHERE repo_id = ? AND issue_number = 42",
      )
      .get(repo.id);
    expect(row).toBeUndefined();
  });

  it("reserves the port in the DB before spawning ttyd (#198 race fix)", async () => {
    addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });

    // Track call order to prove reservation happens before spawn.
    const callOrder: string[] = [];
    reserveTtydPortSpy.mockImplementation(() => {
      callOrder.push("reserveTtydPort");
    });
    spawnTtydSpy.mockImplementation(async () => {
      callOrder.push("spawnTtyd");
      return { pid: 12345, port: 7700 };
    });

    await executeLaunch(db, {} as Octokit, {
      owner: "acme",
      repo: "api",
      issueNumber: 42,
      branchName: "new-branch",
      workspaceMode: "existing",
      selectedComments: [],
      selectedFiles: [],
    });

    expect(callOrder).toEqual(["reserveTtydPort", "spawnTtyd"]);
    expect(reserveTtydPortSpy).toHaveBeenCalledWith(
      db,
      expect.any(Number),
      7700,
    );
  });
});
