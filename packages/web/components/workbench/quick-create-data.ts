import type { BatchCreateResult, ParsedIssue, ParsedIssuesResponse, Priority } from "@issuectl/core";
import type { WorkbenchPayload } from "./workbench-types";

export type CandidateIssue = {
  id: string;
  title: string;
  body: string;
  owner: string;
  repo: string;
  labels: string[];
  accepted: boolean;
  originalText: string;
};

export type DraftState = {
  id: string | null;
  title: string;
  body: string;
  priority: Priority;
  labels: string;
};

export type RepoOption = {
  id: number;
  key: string;
  label: string;
  owner: string;
  repo: string;
};

export type QuickCreateResult = BatchCreateResult;

export function toCandidateIssues(parsed: ParsedIssuesResponse, defaultRepoKey: string): CandidateIssue[] {
  const order = new Map(parsed.suggestedOrder.map((id, index) => [id, index]));
  return [...parsed.issues]
    .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
    .map((issue) => toCandidateIssue(issue, defaultRepoKey));
}

export function repoKey(repo: WorkbenchPayload["repos"][number] | null | undefined): string | null {
  return repo ? `${repo.owner}/${repo.name}` : null;
}

export function unwrapParsedResponse(
  body: { parsed: ParsedIssuesResponse } | ParsedIssuesResponse,
): ParsedIssuesResponse {
  return "parsed" in body ? body.parsed : body;
}

export async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const token = readApiToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(path, { ...init, headers });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    throw new Error(
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed with ${response.status}`,
    );
  }
  return body as T;
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function toCandidateIssue(issue: ParsedIssue, defaultRepoKey: string): CandidateIssue {
  const [defaultOwner = "", defaultRepo = ""] = defaultRepoKey.split("/");
  return {
    id: issue.id,
    title: issue.title,
    body: issue.body,
    owner: issue.repoOwner ?? defaultOwner,
    repo: issue.repoName ?? defaultRepo,
    labels: issue.suggestedLabels,
    accepted: true,
    originalText: issue.originalText,
  };
}

function readApiToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("issuectl.apiToken")
    ?? window.localStorage.getItem("issuectlApiToken");
}
