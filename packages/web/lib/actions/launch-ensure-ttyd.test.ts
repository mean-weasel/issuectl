import { beforeEach, describe, expect, it, vi } from "vitest";
import { withConsoleErrorSilenced } from "../test-utils/console.js";

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const getDb = vi.hoisted(() => vi.fn());
const getDeploymentById = vi.hoisted(() => vi.fn());
const getRepoById = vi.hoisted(() => vi.fn());
const getSetting = vi.hoisted(() => vi.fn());
const coreEndDeployment = vi.hoisted(() => vi.fn());
const isTtydAlive = vi.hoisted(() => vi.fn());
const isTmuxSessionAlive = vi.hoisted(() => vi.fn());
const respawnTtyd = vi.hoisted(() => vi.fn());
const updateTtydInfo = vi.hoisted(() => vi.fn());
const recordDiagnosticEventSafely = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getDeploymentById: (...args: unknown[]) => getDeploymentById(...args),
  getRepoById: (...args: unknown[]) => getRepoById(...args),
  getSetting: (...args: unknown[]) => getSetting(...args),
  endDeployment: (...args: unknown[]) => coreEndDeployment(...args),
  tmuxSessionName: (repo: string, issueNumber: number) =>
    `issuectl-${repo}-${issueNumber}`,
  isTtydAlive: (...args: unknown[]) => isTtydAlive(...args),
  isTmuxSessionAlive: (...args: unknown[]) => isTmuxSessionAlive(...args),
  respawnTtyd: (...args: unknown[]) => respawnTtyd(...args),
  updateTtydInfo: (...args: unknown[]) => updateTtydInfo(...args),
  recordDiagnosticEventSafely: (...args: unknown[]) => recordDiagnosticEventSafely(...args),
  formatErrorForUser: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

import { ensureTtyd } from "./launch.js";

function makeDeployment(ttydPid: number | null = 42) {
  return {
    id: 1,
    repoId: 1,
    issueNumber: 7,
    agent: "claude" as const,
    branchName: "feat/x",
    workspaceMode: "worktree" as const,
    workspacePath: "/tmp/x",
    linkedPrNumber: null,
    state: "active" as const,
    launchedAt: new Date().toISOString(),
    endedAt: null,
    ttydPort: null,
    ttydPid,
  };
}

function makeRepoRecord() {
  return { id: 1, owner: "owner", name: "repo", localPath: "/tmp/repo" };
}

beforeEach(() => {
  getDb.mockReset();
  getDeploymentById.mockReset();
  getRepoById.mockReset();
  getSetting.mockReset();
  coreEndDeployment.mockReset();
  isTtydAlive.mockReset();
  isTmuxSessionAlive.mockReset();
  respawnTtyd.mockReset();
  updateTtydInfo.mockReset();
  recordDiagnosticEventSafely.mockReset();

  getDb.mockReturnValue({ prepare: vi.fn() });
  getDeploymentById.mockReturnValue(makeDeployment(42));
  getRepoById.mockReturnValue(makeRepoRecord());
  getSetting.mockReturnValue("test-api-token");
});

describe("ensureTtyd", () => {
  it("returns invalid deployment ID without touching the DB", async () => {
    const result = await ensureTtyd(0);

    expect(result).toEqual({ alive: false, error: "Invalid deployment ID" });
    expect(getDb).not.toHaveBeenCalled();
    expect(recordDiagnosticEventSafely).not.toHaveBeenCalled();
  });

  it("returns port immediately when ttyd is alive", async () => {
    getDeploymentById.mockReturnValue({ ...makeDeployment(42), ttydPort: 7700 });
    isTtydAlive.mockReturnValue(true);

    const result = await withConsoleErrorSilenced(() => ensureTtyd(1));

    expect(result).toEqual({ port: 7700, terminalToken: expect.any(String) });
    expect(respawnTtyd).not.toHaveBeenCalled();
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        event: "ensure_ttyd.alive",
        deploymentId: 1,
        ttydPort: 7700,
        ttydPid: 42,
      }),
    );
  });

  it("respawns ttyd when dead but tmux alive", async () => {
    getDeploymentById.mockReturnValue({ ...makeDeployment(42), ttydPort: 7700 });
    isTtydAlive.mockReturnValue(false);
    isTmuxSessionAlive.mockReturnValue(true);
    respawnTtyd.mockResolvedValue({ pid: 99 });

    const result = await withConsoleErrorSilenced(() => ensureTtyd(1));

    expect(result).toEqual({ port: 7700, terminalToken: expect.any(String), respawned: true });
    expect(respawnTtyd).toHaveBeenCalledWith(7700, "issuectl-repo-7");
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        event: "ensure_ttyd.respawned",
        owner: "owner",
        repo: "repo",
        deploymentId: 1,
        sessionName: "issuectl-repo-7",
        ttydPort: 7700,
        ttydPid: 99,
      }),
    );
  });

  it("returns alive false when both ttyd and tmux are dead", async () => {
    getDeploymentById.mockReturnValue({ ...makeDeployment(42), ttydPort: 7700 });
    isTtydAlive.mockReturnValue(false);
    isTmuxSessionAlive.mockReturnValue(false);

    const result = await withConsoleErrorSilenced(() => ensureTtyd(1));

    expect(result).toEqual({ alive: false, error: "Terminal session has ended" });
    expect(respawnTtyd).not.toHaveBeenCalled();
    expect(coreEndDeployment).toHaveBeenCalled();
  });

  it("returns alive false when deployment already ended", async () => {
    getDeploymentById.mockReturnValue({ ...makeDeployment(42), endedAt: "2026-01-01" });

    const result = await ensureTtyd(1);

    expect(result).toEqual({ alive: false, error: "Deployment not found or already ended" });
  });

  it("returns alive false when deployment has no ttydPid", async () => {
    getDeploymentById.mockReturnValue(makeDeployment(null));

    const result = await ensureTtyd(1);

    expect(result).toEqual({ alive: false, error: "No terminal process configured" });
  });

  it("calls updateTtydInfo with new PID after respawn", async () => {
    getDeploymentById.mockReturnValue({ ...makeDeployment(42), ttydPort: 7700 });
    isTtydAlive.mockReturnValue(false);
    isTmuxSessionAlive.mockReturnValue(true);
    respawnTtyd.mockResolvedValue({ pid: 99 });

    await ensureTtyd(1);

    expect(updateTtydInfo).toHaveBeenCalledWith(expect.anything(), 1, 7700, 99);
  });

  it("returns formatted error when respawnTtyd throws", async () => {
    getDeploymentById.mockReturnValue({ ...makeDeployment(42), ttydPort: 7700 });
    isTtydAlive.mockReturnValue(false);
    isTmuxSessionAlive.mockReturnValue(true);
    respawnTtyd.mockRejectedValue(new Error("port conflict"));

    const result = await withConsoleErrorSilenced(() => ensureTtyd(1));

    expect(result).toEqual({ alive: false, error: "port conflict" });
  });

  it("returns alive false when repo is not found", async () => {
    getDeploymentById.mockReturnValue({ ...makeDeployment(42), ttydPort: 7700 });
    isTtydAlive.mockReturnValue(false);
    getRepoById.mockReturnValue(undefined);

    const result = await ensureTtyd(1);

    expect(result).toEqual({ alive: false, error: "Repository not found" });
    expect(isTmuxSessionAlive).not.toHaveBeenCalled();
  });
});
