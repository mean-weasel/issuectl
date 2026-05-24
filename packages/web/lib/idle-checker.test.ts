import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkDeploymentLiveness, checkIdleDeployments } from "./idle-checker";

// Mock the modules the checker depends on
vi.mock("./idle-registry", () => ({
  getRegisteredPorts: vi.fn(),
  getLastPtyOutput: vi.fn(),
}));

vi.mock("@issuectl/core", async () => {
  const actual = await vi.importActual<object>("@issuectl/core");
  return {
    ...actual,
    getDb: vi.fn(),
    getActiveDeploymentByPort: vi.fn(),
    getActiveDeployments: vi.fn(),
    endDeployment: vi.fn(),
    isTmuxSessionAlive: vi.fn(),
    tmuxSessionName: vi.fn((repoName: string, targetNumber: number, targetType = "issue") =>
      targetType === "issue"
        ? `issuectl-${repoName}-${targetNumber}`
        : `issuectl-${repoName}-${targetType}-${targetNumber}`,
    ),
    recordDiagnosticEventSafely: vi.fn(),
    setIdleSince: vi.fn(),
    clearIdleSince: vi.fn(),
    getSetting: vi.fn(),
  };
});

vi.mock("./logger", () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const notifyDeploymentTerminalOutcome = vi.hoisted(() => vi.fn());
vi.mock("./push/notifications", () => ({
  notifyDeploymentTerminalOutcome: (...args: unknown[]) =>
    notifyDeploymentTerminalOutcome(...args),
  notifyIdleTerminal: vi.fn(),
}));

import { getRegisteredPorts, getLastPtyOutput } from "./idle-registry";
import {
  getDb,
  getActiveDeploymentByPort,
  getActiveDeployments,
  endDeployment,
  isTmuxSessionAlive,
  recordDiagnosticEventSafely,
  setIdleSince,
  clearIdleSince,
  getSetting,
} from "@issuectl/core";

const mockGetRegisteredPorts = vi.mocked(getRegisteredPorts);
const mockGetLastPtyOutput = vi.mocked(getLastPtyOutput);
const mockGetDb = vi.mocked(getDb);
const mockGetActiveDeploymentByPort = vi.mocked(getActiveDeploymentByPort);
const mockGetActiveDeployments = vi.mocked(getActiveDeployments);
const mockEndDeployment = vi.mocked(endDeployment);
const mockIsTmuxSessionAlive = vi.mocked(isTmuxSessionAlive);
const mockRecordDiagnosticEvent = vi.mocked(recordDiagnosticEventSafely);
const mockSetIdleSince = vi.mocked(setIdleSince);
const mockClearIdleSince = vi.mocked(clearIdleSince);
const mockGetSetting = vi.mocked(getSetting);

describe("checkIdleDeployments", () => {
  const fakeDb = {} as ReturnType<typeof getDb>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockGetDb.mockReturnValue(fakeDb);
    notifyDeploymentTerminalOutcome.mockReset();
    // Default settings: 300s grace, 300s threshold
    mockGetSetting.mockImplementation((_db, key) => {
      if (key === "idle_grace_period") return "300";
      if (key === "idle_threshold") return "300";
      return undefined;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("marks a deployment as idle when no PTY output exceeds threshold", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    mockGetRegisteredPorts.mockReturnValue([7700]);
    // Last output was 400s ago (exceeds 300s threshold)
    mockGetLastPtyOutput.mockReturnValue(now - 400_000);
    mockGetActiveDeploymentByPort.mockReturnValue({
      id: 1,
      repoId: 1,
      issueNumber: 1,
      targetType: "issue",
      targetNumber: 1,
      agent: "claude",
      branchName: "issue-1",
      workspaceMode: "existing" as const,
      workspacePath: "/tmp",
      linkedPrNumber: null,
      state: "active" as const,
      launchedAt: new Date(now - 600_000).toISOString(),
      endedAt: null,
      triggeredBy: "manual",
      parentDeploymentId: null,
      webhookDepth: 0,
      terminalReason: null,
      completionToken: null,
      completionResultJson: null,
      notificationSentAt: null,
      ttydPort: 7700,
      ttydPid: 1234,
      idleSince: null,
    });

    checkIdleDeployments();

    expect(mockSetIdleSince).toHaveBeenCalledWith(fakeDb, 1);
    expect(mockClearIdleSince).not.toHaveBeenCalled();
  });

  it("clears idle when PTY output resumes", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    mockGetRegisteredPorts.mockReturnValue([7700]);
    // Last output was 10s ago (within threshold)
    mockGetLastPtyOutput.mockReturnValue(now - 10_000);
    mockGetActiveDeploymentByPort.mockReturnValue({
      id: 1,
      repoId: 1,
      issueNumber: 1,
      targetType: "issue",
      targetNumber: 1,
      agent: "claude",
      branchName: "issue-1",
      workspaceMode: "existing" as const,
      workspacePath: "/tmp",
      linkedPrNumber: null,
      state: "active" as const,
      launchedAt: new Date(now - 600_000).toISOString(),
      endedAt: null,
      triggeredBy: "manual",
      parentDeploymentId: null,
      webhookDepth: 0,
      terminalReason: null,
      completionToken: null,
      completionResultJson: null,
      notificationSentAt: null,
      ttydPort: 7700,
      ttydPid: 1234,
      idleSince: new Date(now - 60_000).toISOString(), // was idle
    });

    checkIdleDeployments();

    expect(mockClearIdleSince).toHaveBeenCalledWith(fakeDb, 1);
    expect(mockSetIdleSince).not.toHaveBeenCalled();
  });

  it("continues checking remaining ports when one port throws", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    mockGetRegisteredPorts.mockReturnValue([7700, 7701]);
    mockGetLastPtyOutput.mockReturnValue(now - 400_000);
    // First port throws, second returns a valid deployment
    mockGetActiveDeploymentByPort
      .mockImplementationOnce(() => { throw new Error("SQLITE_BUSY"); })
      .mockReturnValueOnce({
        id: 2,
        repoId: 1,
        issueNumber: 2,
        targetType: "issue",
        targetNumber: 2,
        agent: "claude",
        branchName: "issue-2",
        workspaceMode: "existing" as const,
        workspacePath: "/tmp",
        linkedPrNumber: null,
        state: "active" as const,
        launchedAt: new Date(now - 600_000).toISOString(),
        endedAt: null,
        triggeredBy: "manual",
        parentDeploymentId: null,
        webhookDepth: 0,
        terminalReason: null,
        completionToken: null,
        completionResultJson: null,
        notificationSentAt: null,
        ttydPort: 7701,
        ttydPid: 5678,
        idleSince: null,
      });

    checkIdleDeployments();

    // Second port should still be processed
    expect(mockSetIdleSince).toHaveBeenCalledWith(fakeDb, 2);
  });

  it("skips deployments still in grace period", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    mockGetRegisteredPorts.mockReturnValue([7700]);
    // Last output was 400s ago but deployment launched only 200s ago
    mockGetLastPtyOutput.mockReturnValue(now - 400_000);
    mockGetActiveDeploymentByPort.mockReturnValue({
      id: 1,
      repoId: 1,
      issueNumber: 1,
      targetType: "issue",
      targetNumber: 1,
      agent: "claude",
      branchName: "issue-1",
      workspaceMode: "existing" as const,
      workspacePath: "/tmp",
      linkedPrNumber: null,
      state: "active" as const,
      launchedAt: new Date(now - 200_000).toISOString(), // only 200s old
      endedAt: null,
      triggeredBy: "manual",
      parentDeploymentId: null,
      webhookDepth: 0,
      terminalReason: null,
      completionToken: null,
      completionResultJson: null,
      notificationSentAt: null,
      ttydPort: 7700,
      ttydPid: 1234,
      idleSince: null,
    });

    checkIdleDeployments();

    expect(mockSetIdleSince).not.toHaveBeenCalled();
    expect(mockClearIdleSince).not.toHaveBeenCalled();
  });
});

describe("checkDeploymentLiveness", () => {
  const fakeDb = {} as ReturnType<typeof getDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue(fakeDb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records liveness.tmux_missing when it ends a deployment for a missing tmux session", () => {
    mockGetActiveDeployments.mockReturnValue([
      {
        id: 3,
        repoId: 1,
        owner: "owner",
        repoName: "repo",
        issueNumber: 7,
        targetType: "issue",
        targetNumber: 7,
        agent: "claude",
        branchName: "issue-7",
        workspaceMode: "existing",
        workspacePath: "/tmp",
        linkedPrNumber: null,
        state: "active",
        launchedAt: new Date().toISOString(),
        endedAt: null,
        triggeredBy: "manual",
        parentDeploymentId: null,
        webhookDepth: 0,
        terminalReason: null,
        completionToken: null,
        completionResultJson: null,
        notificationSentAt: null,
        ttydPort: 7700,
        ttydPid: 1234,
        idleSince: null,
      },
    ]);
    mockIsTmuxSessionAlive.mockReturnValue(false);

    checkDeploymentLiveness();

    expect(mockEndDeployment).toHaveBeenCalledWith(fakeDb, 3);
    expect(notifyDeploymentTerminalOutcome).toHaveBeenCalledWith({ deploymentId: 3 });
    expect(mockRecordDiagnosticEvent).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({
        level: "warn",
        event: "liveness.tmux_missing",
        source: "web.idle-checker",
        owner: "owner",
        repo: "repo",
        issueNumber: 7,
        deploymentId: 3,
        sessionName: "issuectl-repo-7",
      }),
    );
  });

  it("records liveness.check_failed when querying active deployments fails", () => {
    mockGetActiveDeployments.mockImplementation(() => {
      throw new Error("SQLITE_BUSY");
    });

    checkDeploymentLiveness();

    expect(mockRecordDiagnosticEvent).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({
        level: "error",
        event: "liveness.check_failed",
        source: "web.idle-checker",
        message: "SQLITE_BUSY",
      }),
    );
  });
});
