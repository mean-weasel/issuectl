import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "./test-helpers.js";
import { seedRepo } from "./deployments-test-helpers.js";
import { recordDeployment, getDeploymentById } from "./deployments.js";
import { queryDiagnosticEvents } from "./diagnostics.js";
import { recordAgentCompletionCheckIn } from "./agent-completions.js";

describe("agent completion check-ins", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("records a valid completion exactly once and ends the deployment", () => {
    const repo = seedRepo(db);
    const deployment = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 42,
      branchName: "issue-42",
      workspaceMode: "worktree",
      workspacePath: "/tmp/issue-42",
      triggeredBy: "webhook",
      completionToken: "token-42",
    });

    const first = recordAgentCompletionCheckIn(db, {
      deploymentId: deployment.id,
      completionToken: "token-42",
      status: "no_changes",
      summary: "nothing to change",
      finalHeadSha: "head-a",
    });
    const second = recordAgentCompletionCheckIn(db, {
      deploymentId: deployment.id,
      completionToken: "token-42",
      status: "no_changes",
      summary: "nothing to change",
      finalHeadSha: "head-a",
    });

    expect(first).toEqual({ accepted: true, duplicate: false });
    expect(second).toEqual({ accepted: true, duplicate: true });
    expect(getDeploymentById(db, deployment.id)).toEqual(
      expect.objectContaining({
        endedAt: expect.any(String),
        terminalReason: "completed",
        completionResultJson: JSON.stringify({
          status: "no_changes",
          summary: "nothing to change",
          finalHeadSha: "head-a",
        }),
      }),
    );
    expect(queryDiagnosticEvents(db, { events: ["agent.completion_recorded"] })).toHaveLength(1);
  });

  it("rejects invalid tokens and conflicting duplicate completions", () => {
    const repo = seedRepo(db);
    const deployment = recordDeployment(db, {
      repoId: repo.id,
      issueNumber: 43,
      branchName: "issue-43",
      workspaceMode: "worktree",
      workspacePath: "/tmp/issue-43",
      triggeredBy: "comment_command",
      completionToken: "token-43",
    });

    expect(recordAgentCompletionCheckIn(db, {
      deploymentId: deployment.id,
      completionToken: "wrong",
      status: "completed",
      summary: "done",
    })).toEqual({ accepted: false, reason: "invalid_token" });

    expect(recordAgentCompletionCheckIn(db, {
      deploymentId: deployment.id,
      completionToken: "token-43",
      status: "completed",
      summary: "done",
    })).toEqual({ accepted: true, duplicate: false });

    expect(recordAgentCompletionCheckIn(db, {
      deploymentId: deployment.id,
      completionToken: "token-43",
      status: "failed",
      summary: "different",
    })).toEqual({ accepted: false, reason: "already_completed" });
  });
});
