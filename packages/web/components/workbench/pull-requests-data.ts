export type ChecksStatus = "success" | "failure" | "pending" | null;

export type PullSummary = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  user: { login: string; avatarUrl: string } | null;
  headRef: string;
  baseRef: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  htmlUrl: string;
  checksStatus?: ChecksStatus;
};

export type PullDetail = {
  pull: PullSummary;
  checks: Array<{
    name: string;
    status: string;
    conclusion: string | null;
    htmlUrl: string | null;
  }>;
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
  }>;
  linkedIssue: {
    number: number;
    title: string;
    state: "open" | "closed";
    htmlUrl: string;
  } | null;
  reviews: Array<{
    id: number;
    state: string;
    body: string;
    user: { login: string; avatarUrl: string } | null;
  }>;
};

export type ListResponse = {
  pulls: PullSummary[];
  fromCache?: boolean;
  cachedAt?: string | null;
};

export async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const token = readApiToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(path, { ...init, headers });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Pull request request failed with ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export function linkedIssueNumber(body: string | null): number | null {
  if (!body) return null;
  const match = body.match(/(?:closes|fixes|resolves)\s+(?:[\w.-]+\/[\w.-]+)?#(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function checksSummary(checks: PullDetail["checks"]): string {
  if (checks.length === 0) return "none";
  const failed = checks.filter((check) => check.conclusion === "failure").length;
  const pending = checks.filter((check) => check.status !== "completed").length;
  if (failed > 0) return `${failed} failing`;
  if (pending > 0) return `${pending} pending`;
  return "success";
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function readApiToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("issuectl.apiToken")
    ?? window.localStorage.getItem("issuectlApiToken");
}
