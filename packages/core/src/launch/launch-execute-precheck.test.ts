/* eslint-disable max-lines */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import type { Octokit } from "@octokit/rest";
import { executeLaunch } from "./launch.js";
import { createTestDb } from "../db/test-helpers.js";
import { addRepo } from "../db/repos.js";
import { recordDeployment } from "../db/deployments.js";
import { queryDiagnosticEvents } from "../db/diagnostics.js";
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

const { assemblePrReviewContextSpy } = vi.hoisted(() => ({
  assemblePrReviewContextSpy: vi.fn(() => "fake pr context"),
}));

const { getPullDetailSpy } = vi.hoisted(() => ({
  getPullDetailSpy: vi.fn(async () => ({
    pull: {
      number: 44,
      title: "test PR",
      body: "Please review",
      state: "open",
      draft: false,
      merged: false,
      user: null,
      headRef: "feature/webhooks",
      baseRef: "main",
      headSha: "head-b",
      baseSha: "base-a",
      headRepoFullName: "acme/api",
      baseRepoFullName: "acme/api",
      additions: 1,
      deletions: 0,
      changedFiles: 1,
      createdAt: "2026-04-12T00:00:00Z",
      updatedAt: "2026-04-12T00:00:00Z",
      mergedAt: null,
      closedAt: null,
      htmlUrl: "https://example.invalid/pr/44",
    },
    files: [{ filename: "src/app.ts", status: "modified", patch: "@@" }],
    reviews: [],
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
  tmuxSessionName: (repo: string, targetNumber: number, targetType = "issue") =>
    targetType === "issue"
      ? `issuectl-${repo}-${targetNumber}`
      : `issuectl-${repo}-${targetType}-${targetNumber}`,
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

vi.mock("../data/pulls.js", () => ({
  getPullDetail: getPullDetailSpy,
}));

vi.mock("./context.js", () => ({
  assembleContext: () => "fake context",
  assemblePrReviewContext: assemblePrReviewContextSpy,
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
  let codexHome: string | null = null;
  const previousCodexHome = process.env.CODEX_HOME;

  beforeEach(() => {
    prepareWorkspaceSpy.mockClear();
    verifyTtydSpy.mockClear();
    spawnTtydSpy.mockClear();
    allocatePortSpy.mockClear();
    assemblePrReviewContextSpy.mockClear();
    getPullDetailSpy.mockClear();
    reserveTtydPortSpy.mockClear();
    updateTtydInfoSpy.mockClear();
    db = createTestDb();
  });

  afterEach(async () => {
    if (codexHome) {
      await rm(codexHome, { recursive: true, force: true });
      codexHome = null;
    }
    if (previousCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previousCodexHome;
    }
  });

  async function withConsoleWarnSilenced<T>(fn: () => Promise<T>): Promise<T> {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      return await fn();
    } finally {
      spy.mockRestore();
    }
  }

  it("refuses to launch and skips workspace prep when a live deployment already exists", async () => {
    const repo = addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });
    recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 42,
      branchName: "prior-branch",
      workspaceMode: "existing",
      workspacePath: "/tmp/prior-workspace",
    });

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
    ).rejects.toThrow(/already has an active deployment/);

    expect(prepareWorkspaceSpy).not.toHaveBeenCalled();
  });

  it("translates a race-path UNIQUE violation into the friendly duplicate-launch error", async () => {
    // Simulate the race: the pre-check returns false (the concurrent
    // live row was inserted between the SELECT and the INSERT), but
    // the real live row already exists in the DB, so recordDeployment
    // trips idx_deployments_live. The catch at launch.ts step 8 must
    // translate the raw SqliteError into the same friendly message
    // the pre-check throws.
    const repo = addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });
    recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 42,
      branchName: "winner-branch",
      workspaceMode: "existing",
      workspacePath: "/tmp/winner",
    });

    const preCheckSpy = vi
      .spyOn(deploymentsModule, "hasLiveDeploymentForTarget")
      .mockReturnValue(false);

    try {
      await expect(
        executeLaunch(db, {} as Octokit, {
          owner: "acme",
          repo: "api",
          issueNumber: 42,
          branchName: "loser-branch",
          workspaceMode: "existing",
          selectedComments: [],
          selectedFiles: [],
        }),
      ).rejects.toThrow(/already has an active deployment/);

      // prepareWorkspace *should* have run — this is the race path,
      // not the pre-check path. We're asserting the catch works once
      // we've gotten past the optimistic check.
      expect(prepareWorkspaceSpy).toHaveBeenCalledTimes(1);
    } finally {
      preCheckSpy.mockRestore();
    }
  });

  it("launches PR target identity without fake issue numbers", async () => {
    addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });

    const result = await withConsoleWarnSilenced(() =>
      executeLaunch(db, {} as Octokit, {
        owner: "acme",
        repo: "api",
        targetType: "pr",
        targetNumber: 44,
        branchName: "pr-44-review",
        workspaceMode: "existing",
        selectedComments: [],
        selectedFiles: [],
        triggeredBy: "webhook",
        completionToken: "completion-44",
      }),
    );

    expect(result.deploymentId).toBeGreaterThan(0);
    expect(prepareWorkspaceSpy).toHaveBeenCalledTimes(1);
    expect(spawnTtydSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialPolicy: "scrubbed",
        sessionName: "issuectl-api-pr-44",
        extraEnv: expect.objectContaining({
          ISSUECTL_AGENT_TOKEN: "completion-44",
          ISSUECTL_TARGET_TYPE: "pr",
          ISSUECTL_TARGET_NUMBER: "44",
          ISSUECTL_EXPECTED_HEAD_REF: "feature/webhooks",
          ISSUECTL_EXPECTED_HEAD_SHA: "head-b",
        }),
      }),
    );
    expect(db.prepare(
      "SELECT issue_number, target_type, target_number, completion_token FROM deployments",
    ).get()).toEqual({
      issue_number: null,
      target_type: "pr",
      target_number: 44,
      completion_token: "completion-44",
    });
    expect(db.prepare(
      "SELECT action_type, limit_count FROM agent_action_budgets ORDER BY action_type",
    ).all()).toEqual([
      { action_type: "comment", limit_count: 1 },
      { action_type: "create_issue", limit_count: 0 },
      { action_type: "create_pr", limit_count: 0 },
      { action_type: "label", limit_count: 2 },
      { action_type: "push", limit_count: 1 },
    ]);
    expect(queryDiagnosticEvents(db, {
      target: { owner: "acme", repo: "api", targetType: "pr", targetNumber: 44 },
    })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "launch.requested",
          issueNumber: null,
          targetType: "pr",
          targetNumber: 44,
        }),
      ]),
    );
  });

  it("pre-trusts Codex workspaces for webhook issue launches", async () => {
    codexHome = await mkdtemp(join(tmpdir(), "issuectl-codex-home-"));
    process.env.CODEX_HOME = codexHome;
    addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });

    const result = await withConsoleWarnSilenced(() =>
      executeLaunch(db, {} as Octokit, {
        owner: "acme",
        repo: "api",
        issueNumber: 42,
        agent: "codex",
        branchName: "issue-42",
        workspaceMode: "existing",
        selectedComments: [],
        selectedFiles: [],
        triggeredBy: "webhook",
        completionToken: "completion-42",
      }),
    );

    const config = await readFile(join(codexHome, "config.toml"), "utf8");
    expect(config).toContain(`[projects.${JSON.stringify("/tmp/fake-workspace")}]`);
    expect(config).toContain(`trust_level = "trusted"`);
    expect(spawnTtydSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        agentInputMode: "argument",
      }),
    );
    expect(queryDiagnosticEvents(db, {
      deploymentId: result.deploymentId,
      events: ["agent.preflight.started", "codex.trust.recorded"],
    })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "agent.preflight.started" }),
        expect.objectContaining({ event: "codex.trust.recorded" }),
      ]),
    );
  });

  it("pre-trusts Codex workspaces for webhook PR launches when Codex is selected", async () => {
    codexHome = await mkdtemp(join(tmpdir(), "issuectl-codex-home-"));
    process.env.CODEX_HOME = codexHome;
    addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });

    await withConsoleWarnSilenced(() =>
      executeLaunch(db, {} as Octokit, {
        owner: "acme",
        repo: "api",
        targetType: "pr",
        targetNumber: 44,
        agent: "codex",
        branchName: "pr-44-review",
        workspaceMode: "existing",
        selectedComments: [],
        selectedFiles: [],
        triggeredBy: "webhook",
        completionToken: "completion-44",
      }),
    );

    const config = await readFile(join(codexHome, "config.toml"), "utf8");
    expect(config).toContain(`[projects.${JSON.stringify("/tmp/fake-workspace")}]`);
    expect(queryDiagnosticEvents(db, {
      target: { owner: "acme", repo: "api", targetType: "pr", targetNumber: 44 },
      events: ["codex.trust.recorded"],
    })).toHaveLength(1);
  });

  it("does not pre-trust Claude PR review workspaces", async () => {
    codexHome = await mkdtemp(join(tmpdir(), "issuectl-codex-home-"));
    process.env.CODEX_HOME = codexHome;
    addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });

    await withConsoleWarnSilenced(() =>
      executeLaunch(db, {} as Octokit, {
        owner: "acme",
        repo: "api",
        targetType: "pr",
        targetNumber: 44,
        agent: "claude",
        branchName: "pr-44-review",
        workspaceMode: "existing",
        selectedComments: [],
        selectedFiles: [],
        triggeredBy: "webhook",
        completionToken: "completion-44",
      }),
    );

    await expect(readFile(join(codexHome, "config.toml"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(queryDiagnosticEvents(db, {
      target: { owner: "acme", repo: "api", targetType: "pr", targetNumber: 44 },
      events: ["codex.trust.recorded"],
    })).toHaveLength(0);
  });

  it("launches webhook issue sessions with agent env and issue-scoped mutation budgets", async () => {
    addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });

    const result = await withConsoleWarnSilenced(() =>
      executeLaunch(db, {} as Octokit, {
        owner: "acme",
        repo: "api",
        issueNumber: 42,
        branchName: "issue-42",
        workspaceMode: "existing",
        selectedComments: [],
        selectedFiles: [],
        triggeredBy: "webhook",
        completionToken: "completion-42",
      }),
    );

    expect(result.deploymentId).toBeGreaterThan(0);
    expect(spawnTtydSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialPolicy: "scrubbed",
        sessionName: "issuectl-api-42",
        extraEnv: expect.objectContaining({
          ISSUECTL_AGENT_TOKEN: "completion-42",
          ISSUECTL_TARGET_TYPE: "issue",
          ISSUECTL_TARGET_NUMBER: "42",
        }),
      }),
    );
    expect(db.prepare(
      "SELECT target_type, target_number, completion_token FROM deployments",
    ).get()).toEqual({
      target_type: "issue",
      target_number: 42,
      completion_token: "completion-42",
    });
    expect(db.prepare(
      "SELECT action_type, limit_count FROM agent_action_budgets ORDER BY action_type",
    ).all()).toEqual([
      { action_type: "comment", limit_count: 1 },
      { action_type: "create_issue", limit_count: 0 },
      { action_type: "create_pr", limit_count: 0 },
      { action_type: "label", limit_count: 2 },
      { action_type: "push", limit_count: 0 },
    ]);
  });

  it("does not seed completion env or mutation budgets for manual issue sessions", async () => {
    addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });

    await withConsoleWarnSilenced(() =>
      executeLaunch(db, {} as Octokit, {
        owner: "acme",
        repo: "api",
        issueNumber: 42,
        branchName: "issue-42",
        workspaceMode: "existing",
        selectedComments: [],
        selectedFiles: [],
      }),
    );

    expect(spawnTtydSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        extraEnv: {},
      }),
    );
    expect(db.prepare(
      "SELECT action_type, limit_count FROM agent_action_budgets ORDER BY action_type",
    ).all()).toEqual([]);
  });

  it("passes incremental PR review ranges into the production PR context", async () => {
    addRepo(db, { owner: "acme", name: "api", localPath: "/tmp/fake" });

    await withConsoleWarnSilenced(() =>
      executeLaunch(db, {} as Octokit, {
        owner: "acme",
        repo: "api",
        targetType: "pr",
        targetNumber: 44,
        branchName: "pr-44-review",
        workspaceMode: "existing",
        selectedComments: [],
        selectedFiles: [],
        reviewedFromSha: "head-a",
        reviewedToSha: "head-b",
      }),
    );

    expect(assemblePrReviewContextSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "incremental",
        reviewedFromSha: "head-a",
        reviewedToSha: "head-b",
      }),
    );
    expect(getPullDetailSpy).toHaveBeenCalledWith(
      db,
      expect.anything(),
      "acme",
      "api",
      44,
      {
        forceRefresh: true,
        fileRange: { fromSha: "head-a", toSha: "head-b" },
      },
    );
  });

});
