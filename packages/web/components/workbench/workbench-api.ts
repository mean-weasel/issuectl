import type { LaunchAgent, Priority, WorkspaceMode } from "@issuectl/core";
import type { TerminalBackend, WorkbenchDeployment, WorkbenchPayload } from "./workbench-types";

export class WorkbenchApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WorkbenchApiError";
  }
}

export async function fetchWorkbench({
  apiToken,
  signal,
}: {
  apiToken?: string | null;
  signal?: AbortSignal;
} = {}): Promise<WorkbenchPayload> {
  const headers = new Headers({ Accept: "application/json" });
  const token = apiToken ?? readApiToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch("/api/v1/workbench", {
    method: "GET",
    headers,
    signal,
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Workbench request failed with ${response.status}`;
    throw new WorkbenchApiError(message, response.status);
  }

  return body as WorkbenchPayload;
}

export type EnsureTtydResult =
  | {
      backend?: "ttyd";
      port: number;
      terminalToken: string;
      respawned?: boolean;
    }
  | {
      backend: "pty_bridge";
      deploymentId: number;
      terminalToken: string;
      wsUrl: string;
    }
  | {
      alive: false;
      error?: string;
      backend?: "ttyd" | "pty_bridge";
    };

const STALE_DEPLOYMENT_ERRORS = [
  "Deployment not found or already ended",
  "Terminal session has ended",
];

export function isStaleDeploymentError(message: string | undefined): boolean {
  return message !== undefined && STALE_DEPLOYMENT_ERRORS.some((staleMessage) => message.includes(staleMessage));
}

export function isStaleEnsureTtydResult(result: EnsureTtydResult): boolean {
  return !("port" in result) && !("wsUrl" in result) && isStaleDeploymentError(result.error);
}

export async function ensureDeploymentTtyd(deploymentId: number): Promise<EnsureTtydResult> {
  return requestJson<EnsureTtydResult>(`/api/v1/deployments/${deploymentId}/ensure-ttyd`, {
    method: "POST",
  });
}

export function terminalProxyUrl(port: number, terminalToken: string): string {
  return `/api/terminal/${port}/?terminalToken=${encodeURIComponent(terminalToken)}`;
}

export async function checkTerminalProxy(
  port: number,
  terminalToken: string,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(terminalProxyUrl(port, terminalToken), {
    method: "GET",
    headers: { Accept: "text/html" },
    cache: "no-store",
    signal,
  });

  if (response.ok) return { ok: true };

  let body: string;
  try {
    body = (await response.text()).trim();
  } catch {
    body = "";
  }

  const detail = body || response.statusText || `HTTP ${response.status}`;
  return {
    ok: false,
    error: `Terminal proxy returned ${response.status}: ${detail}`,
  };
}

export async function endDeploymentSession(
  deployment: Pick<WorkbenchDeployment, "id" | "owner" | "repoName" | "issueNumber">,
): Promise<{ success: true }> {
  return requestJson<{ success: true }>(`/api/v1/deployments/${deployment.id}/end`, {
    method: "POST",
    body: JSON.stringify({
      owner: deployment.owner,
      repo: deployment.repoName,
      issueNumber: deployment.issueNumber,
    }),
  });
}

export type WorkbenchIssueDetail = {
  issue: {
    number: number;
    title: string;
    body: string | null;
    state: "open" | "closed";
    labels: Array<{ name: string; color: string; description: string | null }>;
    assignees: Array<{ login: string; avatarUrl: string }>;
    user: { login: string; avatarUrl: string } | null;
    commentCount: number;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null;
    htmlUrl: string;
  };
  comments: Array<{
    id: number;
    body: string;
    user: { login: string; avatarUrl: string } | null;
    createdAt: string;
    updatedAt: string;
    htmlUrl: string;
  }>;
  deployments: WorkbenchDeployment[];
  linkedPRs: Array<{ number: number; title: string; state: "open" | "closed"; htmlUrl: string }>;
  referencedFiles: string[];
  fromCache: boolean;
  cachedAt?: string | null;
};

type IssueRef = { owner: string; repo: string; issueNumber: number };

export async function fetchIssueDetail(ref: IssueRef): Promise<WorkbenchIssueDetail> {
  return requestJson<WorkbenchIssueDetail>(issuePath(ref), { method: "GET" });
}

export async function patchIssue(ref: IssueRef, body: { title?: string; body?: string }) {
  return requestJson<{ success: boolean }>(issuePath(ref), {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function addIssueComment(ref: IssueRef, body: string) {
  return requestJson<{ success: boolean; commentId: number }>(`${issuePath(ref)}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export async function setIssueState(ref: IssueRef, state: "open" | "closed", comment?: string) {
  return requestJson<{ success: boolean }>(`${issuePath(ref)}/state`, {
    method: "POST",
    body: JSON.stringify({ state, ...(comment ? { comment } : {}) }),
  });
}

export async function setIssuePriority(ref: IssueRef, priority: Priority) {
  return requestJson<{ success: boolean }>(`${issuePath(ref)}/priority`, {
    method: "PUT",
    body: JSON.stringify({ priority }),
  });
}

export async function toggleIssueLabel(ref: IssueRef, label: string, action: "add" | "remove") {
  return requestJson<{ success: boolean }>(`${issuePath(ref)}/labels`, {
    method: "POST",
    body: JSON.stringify({ label, action }),
  });
}

export async function setIssueAssignees(ref: IssueRef, assignees: string[]) {
  return requestJson<{ assignees: string[] }>(`${issuePath(ref)}/assignees`, {
    method: "PUT",
    body: JSON.stringify({ assignees }),
  });
}

export async function reassignIssue(ref: IssueRef, targetOwner: string, targetRepo: string) {
  return requestJson<{ success: boolean; newIssueNumber: number; newOwner: string; newRepo: string }>(
    `${issuePath(ref)}/reassign`,
    {
      method: "POST",
      body: JSON.stringify({ targetOwner, targetRepo }),
    },
  );
}

export async function uploadIssueImage(owner: string, repo: string, file: File) {
  const formData = new FormData();
  formData.set("owner", owner);
  formData.set("repo", repo);
  formData.set("file", file);
  return requestJson<{ url: string }>("/api/v1/images/upload", {
    method: "POST",
    body: formData,
  });
}

export type WorktreeStatusResult = {
  exists: boolean;
  dirty: boolean;
  path: string;
  error?: string;
};

export async function fetchWorktreeStatus(ref: IssueRef): Promise<WorktreeStatusResult> {
  const params = new URLSearchParams({
    owner: ref.owner,
    repo: ref.repo,
    issueNumber: String(ref.issueNumber),
  });
  return requestJson<WorktreeStatusResult>(`/api/v1/worktrees/status?${params}`, {
    method: "GET",
  });
}

export async function resetIssueWorktree(ref: IssueRef) {
  return requestJson<{ success: boolean; error?: string }>("/api/v1/worktrees/reset", {
    method: "POST",
    body: JSON.stringify(ref),
  });
}

export async function cleanupWorktrees() {
  return requestJson<{ success?: boolean; removed?: number; error?: string }>("/api/v1/worktrees/cleanup", {
    method: "POST",
  });
}

export type LaunchIssueRequest = {
  agent: LaunchAgent;
  branchName: string;
  workspaceMode: WorkspaceMode;
  selectedCommentIndices: number[];
  selectedFilePaths: string[];
  preamble?: string;
  forceResume: boolean;
  terminalBackend?: TerminalBackend;
  idempotencyKey: string;
};

export type LaunchIssueResult = {
  success?: boolean;
  deploymentId?: number;
  terminalBackend?: TerminalBackend;
  ttydPort?: number | null;
  error?: string;
  labelWarning?: string;
};

export async function launchWorkbenchIssue(
  ref: IssueRef,
  request: LaunchIssueRequest,
): Promise<LaunchIssueResult> {
  return requestJson<LaunchIssueResult>(`/api/v1/launch/${ref.owner}/${ref.repo}/${ref.issueNumber}`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const token = readApiToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, { ...init, headers });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Workbench request failed with ${response.status}`;
    throw new WorkbenchApiError(message, response.status);
  }

  return body as T;
}

function issuePath({ owner, repo, issueNumber }: IssueRef): string {
  return `/api/v1/issues/${owner}/${repo}/${issueNumber}`;
}

function readApiToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("issuectl.apiToken")
    ?? window.localStorage.getItem("issuectlApiToken");
}
