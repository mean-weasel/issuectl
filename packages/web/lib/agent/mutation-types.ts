export type AgentMutationAction =
  | "push"
  | "comment"
  | "label"
  | "create_issue"
  | "create_pr";

export type AgentMutationRequest = {
  deploymentId: number;
  completionToken: string;
  repoId: number;
  targetType: "issue" | "pr";
  targetNumber: number;
  actionType: AgentMutationAction;
  payload?: unknown;
};

export type AgentMutationDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

export type CommentPayload = { body: string };
export type LabelPayload = { label: string; operation?: "add" | "remove" };
export type CreateIssuePayload = { title: string; body?: string };
export type CreatePrPayload = { title: string; head: string; base: string; body?: string };
export type PushPayload = {
  expectedHeadRef: string;
  expectedHeadSha: string;
  newSha: string;
};

export type PullForSafety = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  user: { login: string; avatarUrl: string } | null;
  headRef: string;
  baseRef: string;
  defaultBranch?: string;
  headSha?: string;
  baseSha?: string;
  headRepoFullName?: string;
  baseRepoFullName?: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  htmlUrl: string;
};

export type CommentInput = {
  owner: string;
  repo: string;
  targetNumber: number;
  body: string;
};

export type LabelInput = {
  owner: string;
  repo: string;
  targetNumber: number;
  label: string;
  operation: "add" | "remove";
};

export type CreateIssueInput = {
  owner: string;
  repo: string;
  title: string;
  body?: string;
};

export type CreatePrInput = {
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body?: string;
};

export type PushInput = {
  owner: string;
  repo: string;
  ref: string;
  sha: string;
  expectedHeadSha: string;
};

export type WorkspaceHeadVerificationInput = {
  workspacePath: string;
  expectedHeadRef: string;
  expectedHeadSha: string;
  owner: string;
  repo: string;
};

export type WorkspaceHeadVerificationResult =
  | { ok: true }
  | { ok: false; reason: "unsafe_checkout" };

export type AgentMutationAdapters = {
  comment?: (input: CommentInput) => Promise<void>;
  label?: (input: LabelInput) => Promise<void>;
  createIssue?: (input: CreateIssueInput) => Promise<void>;
  createPr?: (input: CreatePrInput) => Promise<void>;
  fetchPull?: (input: {
    owner: string;
    repo: string;
    targetNumber: number;
  }) => Promise<PullForSafety>;
  isBranchProtected?: (input: {
    owner: string;
    repo: string;
    branch: string;
  }) => Promise<boolean>;
  verifyWorkspaceHead?: (input: WorkspaceHeadVerificationInput) => Promise<WorkspaceHeadVerificationResult>;
  push?: (input: PushInput) => Promise<void>;
};

export const AGENT_MUTATION_ACTIONS: AgentMutationAction[] = [
  "push",
  "comment",
  "label",
  "create_issue",
  "create_pr",
];

export function isAgentMutationAction(value: unknown): value is AgentMutationAction {
  return typeof value === "string" && AGENT_MUTATION_ACTIONS.includes(value as AgentMutationAction);
}
