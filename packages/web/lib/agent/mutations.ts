import type Database from "better-sqlite3";
import { getRepoById } from "@issuectl/core";
import type { Repo } from "@issuectl/core";
import { defaultAgentMutationAdapters } from "./mutation-adapters";
import {
  claimAgentActionBudget,
  ensureAgentActionBudget,
} from "./mutation-budget";
import {
  denyAgentMutation,
  recordMutationExecuted,
} from "./mutation-diagnostics";
import {
  parseCommentPayload,
  parseCreateIssuePayload,
  parseCreatePrPayload,
  parseLabelPayload,
  parsePushPayload,
} from "./mutation-payloads";
import {
  AGENT_MUTATION_ACTIONS,
  isAgentMutationAction,
  type AgentMutationAction,
  type AgentMutationAdapters,
  type AgentMutationDecision,
  type AgentMutationRequest,
  type PullForSafety,
} from "./mutation-types";

export {
  AGENT_MUTATION_ACTIONS,
  isAgentMutationAction,
  type AgentMutationAction,
  type AgentMutationAdapters,
  type AgentMutationDecision,
  type AgentMutationRequest,
  type PullForSafety,
};

type DeploymentSession = {
  repoId: number;
  issueNumber: number | null;
  targetType: "issue" | "pr";
  targetNumber: number;
  triggeredBy: "manual" | "webhook" | "comment_command";
  completionToken: string | null;
  endedAt: string | null;
  webhookDepth: number;
};

type DeploymentSessionRow = {
  repo_id: number;
  issue_number: number | null;
  target_type: "issue" | "pr" | null;
  target_number: number | null;
  triggered_by: "manual" | "webhook" | "comment_command" | null;
  completion_token: string | null;
  ended_at: string | null;
  webhook_depth: number | null;
};

type PreparedExecution =
  | { allowed: false; reason: string }
  | { allowed: true; run: () => Promise<void> };

export function evaluateAgentMutationRequest(
  db: Database.Database,
  request: AgentMutationRequest,
): AgentMutationDecision {
  const auth = evaluateAgentMutationAuth(db, request);
  if (!auth.allowed) return auth;
  ensureAgentActionBudget(db, request.deploymentId, request.actionType);
  return denyAgentMutation(db, request, "action_unimplemented");
}

export async function executeAgentMutationRequest(
  db: Database.Database,
  request: AgentMutationRequest,
  adapters: AgentMutationAdapters = defaultAgentMutationAdapters,
): Promise<AgentMutationDecision> {
  const auth = evaluateAgentMutationAuth(db, request);
  if (!auth.allowed) return auth;

  const execution = await prepareMutationExecution(db, request, auth.repo, adapters);
  if (!execution.allowed) return execution;
  if (!claimAgentActionBudget(db, request.deploymentId, request.actionType)) {
    return denyAgentMutation(db, request, "budget_exhausted");
  }

  await execution.run();
  recordMutationExecuted(db, request);
  return { allowed: true };
}

function evaluateAgentMutationAuth(
  db: Database.Database,
  request: AgentMutationRequest,
): ({ allowed: false; reason: string }) | { allowed: true; repo: Repo } {
  const deployment = getDeploymentSession(db, request.deploymentId);
  if (!deployment) return denyAgentMutation(db, request, "unknown_deployment");
  const repo = getRepoById(db, request.repoId);
  if (!repo) return denyAgentMutation(db, request, "repo_missing");
  if (deployment.endedAt !== null) return denyAgentMutation(db, request, "deployment_ended");
  if (!deployment.completionToken || deployment.completionToken !== request.completionToken) {
    return denyAgentMutation(db, request, "invalid_token");
  }
  if (
    deployment.repoId !== request.repoId ||
    deployment.targetType !== request.targetType ||
    deployment.targetNumber !== request.targetNumber
  ) {
    return denyAgentMutation(db, request, "target_mismatch");
  }
  if (deployment.triggeredBy === "manual") return denyAgentMutation(db, request, "manual_session");
  return { allowed: true, repo };
}

function getDeploymentSession(
  db: Database.Database,
  deploymentId: number,
): DeploymentSession | undefined {
  const depthSelect = hasColumn(db, "deployments", "webhook_depth")
    ? "webhook_depth"
    : "0 AS webhook_depth";
  const row = db.prepare(
    `SELECT repo_id, issue_number, target_type, target_number, triggered_by,
            completion_token, ended_at, ${depthSelect}
     FROM deployments
     WHERE id = ?`,
  ).get(deploymentId) as DeploymentSessionRow | undefined;
  if (!row) return undefined;
  const targetNumber = row.target_number ?? row.issue_number;
  if (!targetNumber) return undefined;
  return {
    repoId: row.repo_id,
    issueNumber: row.issue_number,
    targetType: row.target_type ?? "issue",
    targetNumber,
    triggeredBy: row.triggered_by ?? "manual",
    completionToken: row.completion_token,
    endedAt: row.ended_at,
    webhookDepth: row.webhook_depth ?? 0,
  };
}

async function prepareMutationExecution(
  db: Database.Database,
  request: AgentMutationRequest,
  repo: Repo,
  adapters: AgentMutationAdapters,
): Promise<PreparedExecution> {
  switch (request.actionType) {
    case "comment":
      return prepareComment(db, request, repo, adapters);
    case "label":
      return prepareLabel(db, request, repo, adapters);
    case "create_issue":
      return prepareCreateIssue(db, request, repo, adapters);
    case "create_pr":
      return prepareCreatePr(db, request, repo, adapters);
    case "push":
      return preparePushExecution(db, request, repo, adapters);
  }
}

function prepareComment(
  db: Database.Database,
  request: AgentMutationRequest,
  repo: Repo,
  adapters: AgentMutationAdapters,
): PreparedExecution {
  const payload = parseCommentPayload(request.payload);
  if (!payload) return denyAgentMutation(db, request, "invalid_payload");
  if (!adapters.comment) return denyAgentMutation(db, request, "action_unimplemented");
  return {
    allowed: true,
    run: () => adapters.comment?.({
      owner: repo.owner,
      repo: repo.name,
      targetNumber: request.targetNumber,
      body: payload.body,
    }) ?? Promise.resolve(),
  };
}

function prepareLabel(
  db: Database.Database,
  request: AgentMutationRequest,
  repo: Repo,
  adapters: AgentMutationAdapters,
): PreparedExecution {
  const payload = parseLabelPayload(request.payload);
  if (!payload) return denyAgentMutation(db, request, "invalid_payload");
  if (!adapters.label) return denyAgentMutation(db, request, "action_unimplemented");
  return {
    allowed: true,
    run: () => adapters.label?.({
      owner: repo.owner,
      repo: repo.name,
      targetNumber: request.targetNumber,
      label: payload.label,
      operation: payload.operation ?? "add",
    }) ?? Promise.resolve(),
  };
}

function prepareCreateIssue(
  db: Database.Database,
  request: AgentMutationRequest,
  repo: Repo,
  adapters: AgentMutationAdapters,
): PreparedExecution {
  const payload = parseCreateIssuePayload(request.payload);
  if (!payload) return denyAgentMutation(db, request, "invalid_payload");
  if (!isFollowUpAllowed(db, request.deploymentId)) {
    return denyAgentMutation(db, request, "recursion_depth_exceeded");
  }
  if (!adapters.createIssue) return denyAgentMutation(db, request, "action_unimplemented");
  return {
    allowed: true,
    run: () => adapters.createIssue?.({
      owner: repo.owner,
      repo: repo.name,
      title: payload.title,
      body: payload.body,
    }) ?? Promise.resolve(),
  };
}

function prepareCreatePr(
  db: Database.Database,
  request: AgentMutationRequest,
  repo: Repo,
  adapters: AgentMutationAdapters,
): PreparedExecution {
  const payload = parseCreatePrPayload(request.payload);
  if (!payload) return denyAgentMutation(db, request, "invalid_payload");
  if (!isFollowUpAllowed(db, request.deploymentId)) {
    return denyAgentMutation(db, request, "recursion_depth_exceeded");
  }
  if (payload.head.includes(":")) return denyAgentMutation(db, request, "unsafe_fork_pr");
  if (!adapters.createPr) return denyAgentMutation(db, request, "action_unimplemented");
  return {
    allowed: true,
    run: () => adapters.createPr?.({
      owner: repo.owner,
      repo: repo.name,
      title: payload.title,
      head: payload.head,
      base: payload.base,
      body: payload.body,
    }) ?? Promise.resolve(),
  };
}

async function preparePushExecution(
  db: Database.Database,
  request: AgentMutationRequest,
  repo: Repo,
  adapters: AgentMutationAdapters,
): Promise<PreparedExecution> {
  if (request.targetType !== "pr") return denyAgentMutation(db, request, "target_mismatch");
  const payload = parsePushPayload(request.payload);
  if (!payload) return denyAgentMutation(db, request, "invalid_payload");
  if (!adapters.fetchPull || !adapters.isBranchProtected || !adapters.push) {
    return denyAgentMutation(db, request, "action_unimplemented");
  }

  const pull = await adapters.fetchPull({
    owner: repo.owner,
    repo: repo.name,
    targetNumber: request.targetNumber,
  });
  const repoFullName = `${repo.owner}/${repo.name}`;
  if (!isSameRepoPull(pull, repoFullName)) return denyAgentMutation(db, request, "unsafe_fork_pr");
  if (pull.headRef === pull.baseRef) return denyAgentMutation(db, request, "unsafe_default_branch");
  if (pull.headRef !== payload.expectedHeadRef) {
    return denyAgentMutation(db, request, "head_ref_mismatch");
  }
  if (pull.headSha !== payload.expectedHeadSha) {
    return denyAgentMutation(db, request, "head_sha_mismatch");
  }
  if (await adapters.isBranchProtected({ owner: repo.owner, repo: repo.name, branch: pull.headRef })) {
    return denyAgentMutation(db, request, "unsafe_protected_branch");
  }

  return {
    allowed: true,
    run: () => adapters.push?.({
      owner: repo.owner,
      repo: repo.name,
      ref: `heads/${pull.headRef}`,
      sha: payload.newSha,
      expectedHeadSha: payload.expectedHeadSha,
    }) ?? Promise.resolve(),
  };
}

function isSameRepoPull(pull: PullForSafety, baseRepoFullName: string): boolean {
  return pull.headRepoFullName === baseRepoFullName && pull.baseRepoFullName === baseRepoFullName;
}

function isFollowUpAllowed(db: Database.Database, deploymentId: number): boolean {
  const session = getDeploymentSession(db, deploymentId);
  if (!session) return false;
  const maxDepth = positiveSetting(getLocalSetting(db, "max_webhook_recursion_depth"), 1);
  return session.webhookDepth < maxDepth;
}

function getLocalSetting(db: Database.Database, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

function positiveSetting(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((item) => item.name === column);
}
