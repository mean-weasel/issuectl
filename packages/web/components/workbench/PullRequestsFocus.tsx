"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  checksSummary,
  errorMessage,
  linkedIssueNumber,
  requestJson,
  type ListResponse,
  type PullDetail,
  type PullSummary,
} from "./pull-requests-data";
import { cardStyle, fieldStyle, panelStyle, rowStyle, textareaStyle } from "./pull-requests-styles";
import type { WorkbenchPayload } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type Props = {
  selectedRepo: WorkbenchPayload["repos"][number] | null;
};

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
