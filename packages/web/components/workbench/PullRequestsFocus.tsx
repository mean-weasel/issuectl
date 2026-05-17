"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { WorkbenchPayload } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type Props = {
  selectedRepo: WorkbenchPayload["repos"][number] | null;
};

type ChecksStatus = "success" | "failure" | "pending" | null;

type PullSummary = {
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

type PullDetail = {
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

type ListResponse = {
  pulls: PullSummary[];
  fromCache?: boolean;
  cachedAt?: string | null;
};

const panelStyle = {
  display: "grid",
  gap: "16px",
  maxWidth: "980px",
} satisfies CSSProperties;

const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
} satisfies CSSProperties;

const cardStyle = {
  display: "grid",
  gap: "12px",
  padding: "14px",
  border: "1px solid var(--paper-line)",
  borderRadius: "var(--paper-radius-md)",
  background: "rgba(255, 255, 255, 0.22)",
} satisfies CSSProperties;

const fieldStyle = {
  display: "grid",
  gap: "7px",
  color: "var(--paper-ink-muted)",
  font: "700 10px var(--paper-mono)",
  textTransform: "uppercase",
} satisfies CSSProperties;

const textareaStyle = {
  minHeight: "82px",
  padding: "8px 10px",
  border: "1px solid var(--paper-line)",
  borderRadius: "var(--paper-radius-sm)",
  background: "rgba(255, 255, 255, 0.28)",
  color: "var(--paper-ink)",
  font: "14px var(--paper-serif)",
  textTransform: "none",
  resize: "vertical",
} satisfies CSSProperties;

export function PullRequestsFocus({ selectedRepo }: Props) {
  const [pulls, setPulls] = useState<PullSummary[]>([]);
  const [listStatus, setListStatus] = useState<"idle" | "loading" | "loaded">("idle");
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [detail, setDetail] = useState<PullDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "loaded">("idle");
  const [reviewBody, setReviewBody] = useState("Looks good");
  const [commentBody, setCommentBody] = useState("Workbench PR comment");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const repoLabel = selectedRepo ? `${selectedRepo.owner}/${selectedRepo.name}` : null;
  const selectedPull = useMemo(
    () => pulls.find((pull) => pull.number === selectedNumber) ?? null,
    [pulls, selectedNumber],
  );

  const loadPulls = useCallback(async (
    repo = selectedRepo,
    signal?: AbortSignal,
    forceRefresh = false,
  ) => {
    if (!repo) return;
    setListStatus("loading");
    setError(null);
    setPulls([]);
    setSelectedNumber(null);
    setDetail(null);
    try {
      const query = new URLSearchParams({ checks: "true" });
      if (forceRefresh) query.set("refresh", "true");
      const body = await requestJson<ListResponse>(
        `/api/v1/pulls/${repo.owner}/${repo.name}?${query.toString()}`,
        { method: "GET", signal },
      );
      if (signal?.aborted) return;
      setPulls(body.pulls);
      if (body.pulls.length === 0) {
        setSelectedNumber(null);
        setDetail(null);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(errorMessage(err, "Unable to load pull requests."));
      setPulls([]);
    } finally {
      if (!signal?.aborted) {
        setListStatus("loaded");
      }
    }
  }, [selectedRepo]);

  useEffect(() => {
    const controller = new AbortController();
    setSelectedNumber(null);
    setDetail(null);
    void loadPulls(selectedRepo, controller.signal);
    return () => controller.abort();
  }, [loadPulls, selectedRepo]);

  async function openPull(number: number) {
    if (!selectedRepo) return;
    setSelectedNumber(number);
    setDetailStatus("loading");
    setMessage(null);
    setError(null);
    try {
      const body = await requestJson<PullDetail>(
        `/api/v1/pulls/${selectedRepo.owner}/${selectedRepo.name}/${number}`,
        { method: "GET" },
      );
      setDetail(body);
    } catch (err) {
      setError(errorMessage(err, "Unable to load pull request detail."));
    } finally {
      setDetailStatus("loaded");
    }
  }

  async function submitReview() {
    if (!selectedRepo || !selectedNumber) return;
    setMessage(null);
    setError(null);
    try {
      await requestJson<{ success: boolean; reviewId?: number }>(
        `/api/v1/pulls/${selectedRepo.owner}/${selectedRepo.name}/${selectedNumber}/review`,
        {
          method: "POST",
          body: JSON.stringify({ event: "APPROVE", body: reviewBody }),
        },
      );
      setMessage(`Review approved for #${selectedNumber}.`);
    } catch (err) {
      setError(errorMessage(err, "Unable to submit review."));
    }
  }

  async function mergeSquash() {
    if (!selectedRepo || !selectedNumber) return;
    setMessage(null);
    setError(null);
    try {
      await requestJson<{ success: boolean; sha?: string }>(
        `/api/v1/pulls/${selectedRepo.owner}/${selectedRepo.name}/${selectedNumber}/merge`,
        {
          method: "POST",
          body: JSON.stringify({ mergeMethod: "squash" }),
        },
      );
      markMerged(selectedNumber);
      setMessage(`Pull request #${selectedNumber} merged with squash.`);
    } catch (err) {
      setError(errorMessage(err, "Unable to merge pull request."));
    }
  }

  async function addComment() {
    if (!selectedRepo || !selectedNumber) return;
    setMessage(null);
    setError(null);
    try {
      await requestJson<{ success: boolean; commentId?: number }>(
        `/api/v1/pulls/${selectedRepo.owner}/${selectedRepo.name}/${selectedNumber}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ body: commentBody }),
        },
      );
      setMessage(`Comment added to #${selectedNumber}.`);
    } catch (err) {
      setError(errorMessage(err, "Unable to add comment."));
    }
  }

  function markMerged(number: number) {
    setPulls((current) => current.map((pull) =>
      pull.number === number
        ? { ...pull, state: "closed", merged: true, mergedAt: new Date().toISOString() }
        : pull,
    ));
    setDetail((current) => current && current.pull.number === number
      ? { ...current, pull: { ...current.pull, state: "closed", merged: true } }
      : current);
  }

  if (!selectedRepo || !repoLabel) {
    return (
      <div className={styles.focusInner}>
        <p className={styles.kicker}>PRs</p>
        <h1>Select a repository</h1>
        <p className={styles.muted}>Pull requests are scoped to the active repo.</p>
      </div>
    );
  }

  return (
    <div className={styles.focusInner} style={panelStyle}>
      <header style={rowStyle}>
        <div>
          <p className={styles.kicker}>Pull requests</p>
          <h1>{repoLabel}</h1>
          <p className={styles.muted}>Review, comment on, and merge pull requests for this repository.</p>
        </div>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => void loadPulls(selectedRepo, undefined, true)}
        >
          Refresh checks
        </button>
      </header>

      {error && <p role="alert" className={styles.issueFocusError}>{error}</p>}
      {message && <p role="status" className={styles.issueFocusNotice}>{message}</p>}

      <section aria-label={`Pull requests for ${repoLabel}`} style={{ display: "grid", gap: "10px" }}>
        {listStatus === "loading" && <p className={styles.muted}>Loading pull requests for {repoLabel}.</p>}
        {listStatus === "loaded" && pulls.length === 0 && (
          <p className={styles.muted}>No open pull requests in {repoLabel}.</p>
        )}
        {pulls.map((pull) => {
          const linkedIssue = linkedIssueNumber(pull.body);
          return (
            <article
              key={pull.number}
              aria-label={`Pull request #${pull.number}`}
              data-selected={selectedNumber === pull.number ? "true" : undefined}
              data-checks={pull.checksStatus ?? "unknown"}
              style={cardStyle}
            >
              <div style={rowStyle}>
                <strong>#{pull.number} {pull.title}</strong>
                <span>{pull.merged ? "merged" : pull.state}</span>
                <span>Checks {pull.checksStatus ?? "unknown"}</span>
                {pull.checksStatus === "success" && !pull.merged && <span>Needs review</span>}
                {linkedIssue && <span>Linked issue #{linkedIssue}</span>}
              </div>
              <div className={styles.muted} style={rowStyle}>
                <span>{pull.headRef} into {pull.baseRef}</span>
                <span>+{pull.additions} / -{pull.deletions}</span>
                <span>{pull.changedFiles} files</span>
              </div>
              <button type="button" className={styles.secondaryButton} onClick={() => void openPull(pull.number)}>
                Open PR
              </button>
            </article>
          );
        })}
      </section>

      <section aria-label="Pull request detail" style={cardStyle}>
        {!selectedPull && <p className={styles.muted}>Select a pull request to open details in this focus pane.</p>}
        {selectedPull && detailStatus === "loading" && (
          <p className={styles.issueFocusNotice}>Loading PR #{selectedPull.number}</p>
        )}
        {selectedPull && detail && (
          <>
            <div style={rowStyle}>
              <h2 style={{ margin: 0 }}>#{detail.pull.number} {detail.pull.title}</h2>
              <span>{detail.pull.merged ? "merged" : detail.pull.state}</span>
              {detail.linkedIssue && <span>Linked issue #{detail.linkedIssue.number}</span>}
            </div>
            <p className={styles.muted}>{detail.pull.body || "No description."}</p>
            <div style={rowStyle}>
              <span>Checks: {checksSummary(detail.checks)}</span>
              <span>Reviews: {detail.reviews.length}</span>
              <span>Files: {detail.files.length}</span>
            </div>
            <label style={fieldStyle}>
              Review body
              <textarea value={reviewBody} onChange={(event) => setReviewBody(event.target.value)} style={textareaStyle} />
            </label>
            <label style={fieldStyle}>
              Comment body
              <textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} style={textareaStyle} />
            </label>
            <div style={rowStyle}>
              <button type="button" className={styles.primaryButton} onClick={() => void submitReview()}>
                Review
              </button>
              <button type="button" className={styles.secondaryButton} onClick={() => void mergeSquash()}>
                Merge squash
              </button>
              <button type="button" className={styles.secondaryButton} onClick={() => void addComment()}>
                Comment
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
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

function linkedIssueNumber(body: string | null): number | null {
  if (!body) return null;
  const match = body.match(/(?:closes|fixes|resolves)\s+(?:[\w.-]+\/[\w.-]+)?#(\d+)/i);
  return match ? Number(match[1]) : null;
}

function checksSummary(checks: PullDetail["checks"]): string {
  if (checks.length === 0) return "none";
  const failed = checks.filter((check) => check.conclusion === "failure").length;
  const pending = checks.filter((check) => check.status !== "completed").length;
  if (failed > 0) return `${failed} failing`;
  if (pending > 0) return `${pending} pending`;
  return "success";
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function readApiToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("issuectl.apiToken")
    ?? window.localStorage.getItem("issuectlApiToken");
}
