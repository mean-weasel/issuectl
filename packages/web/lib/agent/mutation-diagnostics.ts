import type Database from "better-sqlite3";
import {
  getRepoById,
  recordDiagnosticEventSafely,
} from "@issuectl/core";
import type { AgentMutationRequest } from "./mutation-types";

export function denyAgentMutation(
  db: Database.Database,
  request: AgentMutationRequest,
  reason: string,
): { allowed: false; reason: string } {
  const repo = getRepoById(db, request.repoId);
  recordDiagnosticEventSafely(db, {
    level: reason === "action_unimplemented" ? "info" : "warn",
    event: "agent.mutation_denied",
    source: "agent.mutations",
    owner: repo?.owner,
    repo: repo?.name,
    deploymentId: request.deploymentId,
    status: reason,
    message: `Agent mutation denied: ${reason}`,
    data: {
      actionType: request.actionType,
      reason,
      repoId: request.repoId,
      targetType: request.targetType,
      targetNumber: request.targetNumber,
    },
  });
  return { allowed: false, reason };
}

export function recordMutationExecuted(
  db: Database.Database,
  request: AgentMutationRequest,
): void {
  const repo = getRepoById(db, request.repoId);
  recordDiagnosticEventSafely(db, {
    level: "info",
    event: "agent.mutation_executed",
    source: "agent.mutations",
    owner: repo?.owner,
    repo: repo?.name,
    deploymentId: request.deploymentId,
    status: "executed",
    message: `Agent mutation executed: ${request.actionType}`,
    data: {
      actionType: request.actionType,
      repoId: request.repoId,
      targetType: request.targetType,
      targetNumber: request.targetNumber,
    },
  });
}
