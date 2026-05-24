import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import { seedRepo } from "./deployments-test-helpers.js";
import {
  claimDeploymentNotificationSent,
  getDeploymentById,
  markDeploymentNotificationSent,
  recordDeployment,
  recordDeploymentCompletion,
} from "./deployments.js";

describe("deployment completion notifications", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("records completion result and idempotent notification timestamp", () => {
    const repo = seedRepo(db);
    const dep = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 11,
      branchName: "issue-11",
      workspaceMode: "clone",
      workspacePath: "/tmp/clone",
    });

    recordDeploymentCompletion(db, dep.id, {
      terminalReason: "completed",
      resultJson: JSON.stringify({ status: "completed", summary: "done" }),
    });
    markDeploymentNotificationSent(db, dep.id);
    const completed = getDeploymentById(db, dep.id);

    expect(completed).toEqual(
      expect.objectContaining({
        terminalReason: "completed",
        completionResultJson: JSON.stringify({ status: "completed", summary: "done" }),
        notificationSentAt: expect.any(String),
      }),
    );
    markDeploymentNotificationSent(db, dep.id);
    expect(getDeploymentById(db, dep.id)?.notificationSentAt).toBe(completed?.notificationSentAt);
  });

  it("claims deployment notification exactly once", () => {
    const repo = seedRepo(db);
    const dep = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 12,
      branchName: "issue-12",
      workspaceMode: "clone",
      workspacePath: "/tmp/clone",
      triggeredBy: "webhook",
    });

    expect(claimDeploymentNotificationSent(db, dep.id)).toBe(true);
    const firstTimestamp = getDeploymentById(db, dep.id)?.notificationSentAt;
    expect(firstTimestamp).toEqual(expect.any(String));
    expect(claimDeploymentNotificationSent(db, dep.id)).toBe(false);
    expect(getDeploymentById(db, dep.id)?.notificationSentAt).toBe(firstTimestamp);
  });
});
