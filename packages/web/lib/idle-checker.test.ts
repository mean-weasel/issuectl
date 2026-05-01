import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkIdleDeployments } from "./idle-checker";

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

import { getRegisteredPorts, getLastPtyOutput } from "./idle-registry";
import {
  getDb,
  getActiveDeploymentByPort,
  setIdleSince,
  clearIdleSince,
  getSetting,
} from "@issuectl/core";

const mockGetRegisteredPorts = vi.mocked(getRegisteredPorts);
const mockGetLastPtyOutput = vi.mocked(getLastPtyOutput);
const mockGetDb = vi.mocked(getDb);
const mockGetActiveDeploymentByPort = vi.mocked(getActiveDeploymentByPort);
const mockSetIdleSince = vi.mocked(setIdleSince);
const mockClearIdleSince = vi.mocked(clearIdleSince);
const mockGetSetting = vi.mocked(getSetting);

describe("checkIdleDeployments", () => {
  const fakeDb = {} as ReturnType<typeof getDb>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockGetDb.mockReturnValue(fakeDb);
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
      agent: "claude",
      branchName: "issue-1",
      workspaceMode: "existing" as const,
      workspacePath: "/tmp",
      linkedPrNumber: null,
      state: "active" as const,
      launchedAt: new Date(now - 600_000).toISOString(),
      endedAt: null,
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
      agent: "claude",
      branchName: "issue-1",
      workspaceMode: "existing" as const,
      workspacePath: "/tmp",
      linkedPrNumber: null,
      state: "active" as const,
      launchedAt: new Date(now - 600_000).toISOString(),
      endedAt: null,
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
        agent: "claude",
        branchName: "issue-2",
        workspaceMode: "existing" as const,
        workspacePath: "/tmp",
        linkedPrNumber: null,
        state: "active" as const,
        launchedAt: new Date(now - 600_000).toISOString(),
        endedAt: null,
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
      agent: "claude",
      branchName: "issue-1",
      workspaceMode: "existing" as const,
      workspacePath: "/tmp",
      linkedPrNumber: null,
      state: "active" as const,
      launchedAt: new Date(now - 200_000).toISOString(), // only 200s old
      endedAt: null,
      ttydPort: 7700,
      ttydPid: 1234,
      idleSince: null,
    });

    checkIdleDeployments();

    expect(mockSetIdleSince).not.toHaveBeenCalled();
    expect(mockClearIdleSince).not.toHaveBeenCalled();
  });
});
