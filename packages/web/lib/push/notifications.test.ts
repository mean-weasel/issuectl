import { beforeEach, describe, expect, it, vi } from "vitest";
import notificationContractFixture from "./notification-contract.fixture.json";

const deletePushDevice = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
const getDeploymentById = vi.hoisted(() => vi.fn());
const getRepoById = vi.hoisted(() => vi.fn());
const listPushDevicesForKind = vi.hoisted(() => vi.fn());
const recordDiagnosticEventSafely = vi.hoisted(() => vi.fn());
const sendApnsNotification = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  deletePushDevice: (...args: unknown[]) => deletePushDevice(...args),
  getDb: () => getDb(),
  getDeploymentById: (...args: unknown[]) => getDeploymentById(...args),
  getRepoById: (...args: unknown[]) => getRepoById(...args),
  listPushDevicesForKind: (...args: unknown[]) => listPushDevicesForKind(...args),
  recordDiagnosticEventSafely: (...args: unknown[]) => recordDiagnosticEventSafely(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("./apns", () => ({
  sendApnsNotification: (...args: unknown[]) => sendApnsNotification(...args),
}));

import {
  notifyDeploymentTerminalOutcome,
  notifyDevices,
} from "./notifications";

const runClaim = vi.fn();
const db = {
  prepare: vi.fn(() => ({ run: runClaim })),
};

function deployment(overrides: Record<string, unknown> = {}) {
  return {
    id: 12,
    repoId: 3,
    targetType: "issue",
    targetNumber: 506,
    triggeredBy: "webhook",
    terminalReason: "completed",
    endedAt: "2026-05-24T00:00:00Z",
    ...overrides,
  };
}

describe("push notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runClaim.mockReturnValue({ changes: 1 });
    getDb.mockReturnValue(db);
    getRepoById.mockReturnValue({ id: 3, owner: "mean-weasel", name: "issuectl" });
    listPushDevicesForKind.mockReturnValue([]);
    sendApnsNotification.mockResolvedValue({ status: "sent", token: "device-token" });
  });

  it("claims before notifying a terminal webhook deployment outcome", async () => {
    getDeploymentById.mockReturnValue(deployment());
    listPushDevicesForKind.mockReturnValue([
      {
        token: "device-token",
        platform: "ios",
        environment: "development",
      },
    ]);

    expect(notifyDeploymentTerminalOutcome({ deploymentId: 12 })).toBe(true);
    await vi.waitFor(() => expect(sendApnsNotification).toHaveBeenCalled());

    expect(db.prepare).toHaveBeenCalledWith(
      "UPDATE deployments SET notification_sent_at = datetime('now') WHERE id = ? AND notification_sent_at IS NULL",
    );
    expect(runClaim).toHaveBeenCalledWith(12);
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        event: "webhook.notification_sent",
        deploymentId: 12,
        issueNumber: 506,
      }),
    );
    expect(listPushDevicesForKind).toHaveBeenCalledWith(db, "idleTerminals");
    expect(sendApnsNotification).toHaveBeenCalledWith(
      expect.objectContaining({ token: "device-token" }),
      expect.objectContaining({
        aps: expect.objectContaining({
          alert: {
            title: "Session ended",
            body: "mean-weasel/issuectl issue #506: completed",
          },
        }),
        deploymentId: 12,
        targetType: "issue",
        targetNumber: 506,
      }),
    );
  });

  it("does not notify manual, active, or already-claimed deployments", () => {
    getDeploymentById.mockReturnValueOnce(deployment({ triggeredBy: "manual" }));
    expect(notifyDeploymentTerminalOutcome({ deploymentId: 12 })).toBe(false);
    getDeploymentById.mockReturnValueOnce(deployment({ endedAt: null }));
    expect(notifyDeploymentTerminalOutcome({ deploymentId: 12 })).toBe(false);
    getDeploymentById.mockReturnValueOnce(deployment());
    runClaim.mockReturnValueOnce({ changes: 0 });
    expect(notifyDeploymentTerminalOutcome({ deploymentId: 12 })).toBe(false);

    expect(sendApnsNotification).not.toHaveBeenCalled();
  });

  it("uses structured PR completion results in terminal outcome notifications", async () => {
    getDeploymentById.mockReturnValue(deployment({
      targetType: "pr",
      targetNumber: 44,
      completionResultJson: JSON.stringify({
        status: "pushed_fixes",
        summary: "fixed two findings",
        finalHeadSha: "head-b",
        pushedCommitSha: "abcdef123456",
      }),
    }));
    listPushDevicesForKind.mockReturnValue([
      { token: "device-token", platform: "ios", environment: "development" },
    ]);

    expect(notifyDeploymentTerminalOutcome({ deploymentId: 12 })).toBe(true);
    await vi.waitFor(() => expect(sendApnsNotification).toHaveBeenCalled());

    expect(sendApnsNotification).toHaveBeenCalledWith(
      expect.objectContaining({ token: "device-token" }),
      expect.objectContaining({
        aps: expect.objectContaining({
          alert: {
            title: "Session ended",
            body: "mean-weasel/issuectl PR #44: pushed fixes (abcdef1)",
          },
        }),
        completionStatus: "pushed_fixes",
        finalHeadSha: "head-b",
        pushedCommitSha: "abcdef123456",
      }),
    );
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ status: "pushed_fixes" }),
    );
  });

  it("skips device delivery when APNs credentials are absent", async () => {
    listPushDevicesForKind.mockReturnValue([
      { token: "device-token", platform: "ios", environment: "development" },
    ]);
    sendApnsNotification.mockResolvedValue({
      status: "skipped",
      token: "device-token",
      reason: "APNs credentials are not configured",
    });

    await notifyDevices({
      kind: "idleTerminals",
      title: "Session ended",
      body: "done",
    });

    expect(sendApnsNotification).toHaveBeenCalledTimes(1);
    expect(deletePushDevice).not.toHaveBeenCalled();
  });

  it("keeps notification deep links relative and parseable", () => {
    for (const item of notificationContractFixture) {
      expect(item.url.startsWith("/")).toBe(true);
      expect(item.url).not.toContain("://");
      expect(() => new URL(item.url, "http://localhost:3847")).not.toThrow();
    }
  });
});
