import { beforeEach, describe, expect, it, vi } from "vitest";
import type Database from "better-sqlite3";
import type { Octokit } from "@octokit/rest";
import { executeLaunch } from "./launch.js";
import { createTestDb } from "../db/test-helpers.js";
import { addRepo } from "../db/repos.js";
import { recordDeployment } from "../db/deployments.js";

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

vi.mock("../db/diagnostics.js", () => ({
  recordDiagnosticEventSafely: vi.fn(),
}));

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
    addLabels: async () => {},
  };
});

describe("executeLaunch terminal backend selection", () => {
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

  it("uses the terminal_backend setting for new launches when no env override is set", async () => {
    const repo = addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "terminal_backend",
      "pty_bridge",
    );

    const result = await withConsoleWarnSilenced(() => executeLaunch(db, {} as Octokit, {
      owner: "acme",
      repo: "api",
      issueNumber: 46,
      agent: "codex",
      branchName: "setting-pty-bridge",
      workspaceMode: "existing",
      selectedComments: [],
      selectedFiles: [],
    }));

    expect(result.terminalBackend).toBe("pty_bridge");
    expect(verifyTmuxSpy).toHaveBeenCalledTimes(1);
    expect(verifyTtydSpy).not.toHaveBeenCalled();
    expect(spawnPtyBridgeSessionSpy).toHaveBeenCalledTimes(1);
    expect(spawnTtydSpy).not.toHaveBeenCalled();

    const row = db
      .prepare("SELECT terminal_backend FROM deployments WHERE repo_id = ? AND issue_number = ?")
      .get(repo.id, 46) as { terminal_backend: string };
    expect(row.terminal_backend).toBe("pty_bridge");
  });

  it("keeps the recorded backend on existing deployments when the default changes", async () => {
    const repo = addRepo(db, {
      owner: "acme",
      name: "api",
      localPath: "/tmp/fake",
    });
    const existing = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 46,
      branchName: "existing-ttyd",
      workspaceMode: "existing",
      workspacePath: "/tmp/existing",
      terminalBackend: "ttyd",
    });
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "terminal_backend",
      "pty_bridge",
    );

    await withConsoleWarnSilenced(() => executeLaunch(db, {} as Octokit, {
      owner: "acme",
      repo: "api",
      issueNumber: 47,
      agent: "codex",
      branchName: "new-pty-bridge",
      workspaceMode: "existing",
      selectedComments: [],
      selectedFiles: [],
    }));

    const rows = db
      .prepare("SELECT id, terminal_backend FROM deployments WHERE repo_id = ? ORDER BY id")
      .all(repo.id) as Array<{ id: number; terminal_backend: string }>;
    expect(rows).toContainEqual({ id: existing.id, terminal_backend: "ttyd" });
    expect(rows.at(-1)?.terminal_backend).toBe("pty_bridge");
  });
});
