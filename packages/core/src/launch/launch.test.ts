import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import type { Octokit } from "@octokit/rest";
import { buildClaudeCommand, executeLaunch } from "./launch.js";
import { createTestDb } from "../db/test-helpers.js";
import { addRepo } from "../db/repos.js";
import { recordDeployment } from "../db/deployments.js";
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
}));

const { updateTtydInfoSpy } = vi.hoisted(() => ({
  updateTtydInfoSpy: vi.fn(),
}));

vi.mock("../db/deployments.js", async () => {
  const actual =
    await vi.importActual<typeof import("../db/deployments.js")>(
      "../db/deployments.js",
    );
  return {
    ...actual,
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
    removeLabel: async () => {},
  };
});

describe("buildClaudeCommand", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns 'claude' for undefined", () => {
    expect(buildClaudeCommand(undefined)).toBe("claude");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns 'claude' for empty string", () => {
    expect(buildClaudeCommand("")).toBe("claude");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns 'claude' for whitespace-only string", () => {
    expect(buildClaudeCommand("   ")).toBe("claude");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("appends trimmed extra args for a normal value", () => {
    expect(buildClaudeCommand("--dangerously-skip-permissions")).toBe(
      "claude --dangerously-skip-permissions",
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("appends multiple args", () => {
    expect(buildClaudeCommand("--verbose --model opus")).toBe("claude --verbose --model opus");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("trims surrounding whitespace before composing", () => {
    expect(buildClaudeCommand("  --verbose  ")).toBe("claude --verbose");
  });

  it("falls back to 'claude' and warns on semicolon (tampered DB)", () => {
    expect(buildClaudeCommand("--foo; rm -rf /")).toBe("claude");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/metacharacters/i);
  });

  it("falls back on backtick", () => {
    expect(buildClaudeCommand("`evil`")).toBe("claude");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on $ variable", () => {
    expect(buildClaudeCommand("--append $HOME")).toBe("claude");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on && operator", () => {
    expect(buildClaudeCommand("--foo && --bar")).toBe("claude");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on pipe", () => {
    expect(buildClaudeCommand("--foo | cat")).toBe("claude");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on redirect", () => {
    expect(buildClaudeCommand("--foo > out.txt")).toBe("claude");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on newline (injection attempt)", () => {
    expect(buildClaudeCommand("--foo\nrm -rf /")).toBe("claude");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back on parentheses", () => {
    expect(buildClaudeCommand("(echo hi)")).toBe("claude");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe("executeLaunch duplicate-deployment pre-check", () => {
  let db: Database.Database;

  beforeEach(() => {
    prepareWorkspaceSpy.mockClear();
    verifyTtydSpy.mockClear();
    spawnTtydSpy.mockClear();
    allocatePortSpy.mockClear();
    updateTtydInfoSpy.mockClear();
    db = createTestDb();
  });

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
      .spyOn(deploymentsModule, "hasLiveDeploymentForIssue")
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
        claudeCommand: "claude",
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
});
