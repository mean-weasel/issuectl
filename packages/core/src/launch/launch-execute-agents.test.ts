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

const { verifyTtydSpy, verifyTmuxSpy, spawnTtydSpy, spawnPtyBridgeSessionSpy, allocatePortSpy } = vi.hoisted(() => ({
  verifyTtydSpy: vi.fn(),
  verifyTmuxSpy: vi.fn(),
  spawnTtydSpy: vi.fn(async () => ({ pid: 12345, port: 7700 })),
  spawnPtyBridgeSessionSpy: vi.fn(),
  allocatePortSpy: vi.fn(async () => 7700),
}));

vi.mock("./ttyd.js", () => ({
  verifyTtyd: verifyTtydSpy,
  verifyTmux: verifyTmuxSpy,
  spawnTtyd: spawnTtydSpy,
  spawnPtyBridgeSession: spawnPtyBridgeSessionSpy,
  allocatePort: allocatePortSpy,
  tmuxSessionName: (repo: string, issueNumber: number) =>
    `issuectl-${repo}-${issueNumber}`,
}));

const { reserveTtydPortSpy, updateTtydInfoSpy } = vi.hoisted(() => ({
  reserveTtydPortSpy: vi.fn(),
  updateTtydInfoSpy: vi.fn(),
}));

const { recordDiagnosticEventSpy } = vi.hoisted(() => ({
  recordDiagnosticEventSpy: vi.fn(),
}));

vi.mock("../db/diagnostics.js", () => ({
  recordDiagnosticEventSafely: recordDiagnosticEventSpy,
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
    delete process.env.ISSUECTL_PTY_BRIDGE;
    prepareWorkspaceSpy.mockClear();
    verifyTtydSpy.mockClear();
    verifyTmuxSpy.mockClear();
    spawnTtydSpy.mockClear();
    spawnPtyBridgeSessionSpy.mockClear();
    allocatePortSpy.mockClear();
    reserveTtydPortSpy.mockClear();
    updateTtydInfoSpy.mockClear();
    recordDiagnosticEventSpy.mockClear();
    db = createTestDb();
  });

  async function withConsoleWarnSilenced<T>(fn: () => Promise<T>): Promise<T> {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      return await fn();
    } finally {
      spy.mockRestore();
    }
  }

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

    const result = await withConsoleWarnSilenced(() => executeLaunch(db, {} as Octokit, {
      owner: "acme",
      repo: "api",
      issueNumber: 42,
      branchName: "new-branch",
      workspaceMode: "existing",
      selectedComments: [],
      selectedFiles: [],
    }));

    expect(prepareWorkspaceSpy).toHaveBeenCalledTimes(1);
    expect(spawnTtydSpy).toHaveBeenCalledTimes(1);
    expect(spawnTtydSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 7700,
        workspacePath: "/tmp/fake-workspace",
        agentCommand: expect.stringMatching(/(^|\/)claude$/),
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
    const spawnedDiagnosticCall = recordDiagnosticEventSpy.mock.calls.findIndex(
      ([, input]) =>
        (input as { event?: string } | undefined)?.event === "ttyd.spawned",
    );
    expect(spawnedDiagnosticCall).toBeGreaterThanOrEqual(0);
    expect(
      updateTtydInfoSpy.mock.invocationCallOrder[0],
    ).toBeLessThan(
      recordDiagnosticEventSpy.mock.invocationCallOrder[spawnedDiagnosticCall],
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

    await withConsoleWarnSilenced(() => executeLaunch(db, {} as Octokit, {
      owner: "acme",
      repo: "api",
      issueNumber: 43,
      correlationId: "test-correlation",
      branchName: "codex-branch",
      workspaceMode: "existing",
      selectedComments: [],
      selectedFiles: [],
    }));

    expect(spawnTtydSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        agentCommand: expect.stringMatching(/(^|\/)codex --model gpt-5 --full-auto$/),
        agentInputMode: "argument",
      }),
    );
    const row = db
      .prepare("SELECT agent FROM deployments WHERE repo_id = ? AND issue_number = ?")
      .get(repo.id, 43) as { agent: string };
    expect(row.agent).toBe("codex");
    expect(recordDiagnosticEventSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        event: "launch.requested",
        correlationId: "test-correlation",
        owner: "acme",
        repo: "api",
        issueNumber: 43,
      }),
    );
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

    await withConsoleWarnSilenced(() => executeLaunch(db, {} as Octokit, {
      owner: "acme",
      repo: "api",
      issueNumber: 44,
      agent: "codex",
      branchName: "codex-override",
      workspaceMode: "existing",
      selectedComments: [],
      selectedFiles: [],
    }));

    expect(spawnTtydSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        agentCommand: expect.stringMatching(/(^|\/)codex --sandbox danger-full-access --ask-for-approval never$/),
        agentInputMode: "argument",
      }),
    );
    const row = db
      .prepare("SELECT agent FROM deployments WHERE repo_id = ? AND issue_number = ?")
      .get(repo.id, 44) as { agent: string };
    expect(row.agent).toBe("codex");
  });

  it("records a pty bridge deployment and skips ttyd when the experiment is enabled", async () => {
    process.env.ISSUECTL_PTY_BRIDGE = "1";
    const repo = addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });

    const result = await withConsoleWarnSilenced(() => executeLaunch(db, {} as Octokit, {
      owner: "acme",
      repo: "api",
      issueNumber: 45,
      agent: "codex",
      branchName: "pty-bridge",
      workspaceMode: "existing",
      selectedComments: [],
      selectedFiles: [],
    }));

    expect(verifyTmuxSpy).toHaveBeenCalledTimes(1);
    expect(verifyTtydSpy).not.toHaveBeenCalled();
    expect(allocatePortSpy).not.toHaveBeenCalled();
    expect(reserveTtydPortSpy).not.toHaveBeenCalled();
    expect(spawnTtydSpy).not.toHaveBeenCalled();
    expect(updateTtydInfoSpy).not.toHaveBeenCalled();
    expect(spawnPtyBridgeSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePath: "/tmp/fake-workspace",
        contextFilePath: "/tmp/fake-context.md",
        agentCommand: expect.stringMatching(/(^|\/)codex$/),
        agentInputMode: "argument",
        sessionName: "issuectl-api-45",
      }),
    );
    expect(result.ttydPort).toBeNull();

    const row = db
      .prepare("SELECT terminal_backend, ttyd_port, ttyd_pid, state FROM deployments WHERE repo_id = ? AND issue_number = ?")
      .get(repo.id, 45) as { terminal_backend: string; ttyd_port: number | null; ttyd_pid: number | null; state: string };
    expect(row).toEqual({
      terminal_backend: "pty_bridge",
      ttyd_port: null,
      ttyd_pid: null,
      state: "active",
    });
    expect(recordDiagnosticEventSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        event: "pty.bridge_spawned",
        deploymentId: result.deploymentId,
        sessionName: "issuectl-api-45",
      }),
    );
  });

});
