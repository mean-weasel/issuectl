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
import type { WorkbenchPayload, WorkbenchRepo } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type Props = {
  repos: WorkbenchPayload["repos"];
  selectedRepo: WorkbenchPayload["repos"][number] | null;
};

type RepoPull = PullSummary & {
  key: string;
  repo: WorkbenchRepo;
  repoLabel: string;
};

export function PullRequestsFocus({ repos, selectedRepo }: Props) {
  const [repoFilter, setRepoFilter] = useState<string>(() => selectedRepo ? repoLabel(selectedRepo) : "all");
  const [pulls, setPulls] = useState<RepoPull[]>([]);
  const [listStatus, setListStatus] = useState<"idle" | "loading" | "loaded">("idle");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<PullDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "loaded">("idle");
  const [reviewBody, setReviewBody] = useState("Looks good");
  const [commentBody, setCommentBody] = useState("Workbench PR comment");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRepoFilter(selectedRepo ? repoLabel(selectedRepo) : "all");
  }, [selectedRepo]);

  const reposToLoad = useMemo(
    () => repoFilter === "all" ? repos : repos.filter((repo) => repoLabel(repo) === repoFilter),
    [repoFilter, repos],
  );
  const selectedPull = useMemo(
    () => pulls.find((pull) => pull.key === selectedKey) ?? null,
    [pulls, selectedKey],
  );

  const loadPulls = useCallback(async (
    targetRepos = reposToLoad,
    signal?: AbortSignal,
    forceRefresh = false,
  ) => {
    setListStatus("loading");
    setError(null);
    setPulls([]);
    setSelectedKey(null);
    setDetail(null);
    try {
      const nextPulls = await Promise.all(targetRepos.map(async (repo) => {
        const query = new URLSearchParams({ checks: "true" });
        if (forceRefresh) query.set("refresh", "true");
        const body = await requestJson<ListResponse>(
          `/api/v1/pulls/${repo.owner}/${repo.name}?${query.toString()}`,
          { method: "GET", signal },
        );
        const label = repoLabel(repo);
        return body.pulls.map((pull): RepoPull => ({
          ...pull,
          key: `${label}#${pull.number}`,
          repo,
          repoLabel: label,
        }));
      }));
      if (signal?.aborted) return;
      setPulls(nextPulls.flat().sort((left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
        || left.repoLabel.localeCompare(right.repoLabel)
        || left.number - right.number,
      ));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(errorMessage(err, "Unable to load pull requests."));
      setPulls([]);
    } finally {
      if (!signal?.aborted) {
        setListStatus("loaded");
      }
    }
  }, [reposToLoad]);

  useEffect(() => {
    const controller = new AbortController();
    setSelectedKey(null);
    setDetail(null);
    void loadPulls(reposToLoad, controller.signal);
    return () => controller.abort();
  }, [loadPulls, reposToLoad]);

  async function openPull(pull: RepoPull) {
    setSelectedKey(pull.key);
    setDetailStatus("loading");
    setMessage(null);
    setError(null);
    try {
      const body = await requestJson<PullDetail>(
        `/api/v1/pulls/${pull.repo.owner}/${pull.repo.name}/${pull.number}`,
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
    if (!selectedPull) return;
    setMessage(null);
    setError(null);
    try {
      await requestJson<{ success: boolean; reviewId?: number }>(
        `/api/v1/pulls/${selectedPull.repo.owner}/${selectedPull.repo.name}/${selectedPull.number}/review`,
        {
          method: "POST",
          body: JSON.stringify({ event: "APPROVE", body: reviewBody }),
        },
      );
      setMessage(`Review approved for ${selectedPull.repoLabel} #${selectedPull.number}.`);
    } catch (err) {
      setError(errorMessage(err, "Unable to submit review."));
    }
  }

  async function mergeSquash() {
    if (!selectedPull) return;
    setMessage(null);
    setError(null);
    try {
      await requestJson<{ success: boolean; sha?: string }>(
        `/api/v1/pulls/${selectedPull.repo.owner}/${selectedPull.repo.name}/${selectedPull.number}/merge`,
        {
          method: "POST",
          body: JSON.stringify({ mergeMethod: "squash" }),
        },
      );
      markMerged(selectedPull.key);
      setMessage(`Pull request ${selectedPull.repoLabel} #${selectedPull.number} merged with squash.`);
    } catch (err) {
      setError(errorMessage(err, "Unable to merge pull request."));
    }
  }

  async function addComment() {
    if (!selectedPull) return;
    setMessage(null);
    setError(null);
    try {
      await requestJson<{ success: boolean; commentId?: number }>(
        `/api/v1/pulls/${selectedPull.repo.owner}/${selectedPull.repo.name}/${selectedPull.number}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ body: commentBody }),
        },
      );
      setMessage(`Comment added to ${selectedPull.repoLabel} #${selectedPull.number}.`);
    } catch (err) {
      setError(errorMessage(err, "Unable to add comment."));
    }
  }

  function markMerged(key: string) {
    setPulls((current) => current.map((pull) =>
      pull.key === key
        ? { ...pull, state: "closed", merged: true, mergedAt: new Date().toISOString() }
        : pull,
    ));
    setDetail((current) => current && selectedPull && current.pull.number === selectedPull.number
      ? { ...current, pull: { ...current.pull, state: "closed", merged: true } }
      : current);
  }

  return (
    <div className={styles.focusInner} style={panelStyle}>
      <header style={rowStyle}>
        <div>
          <p className={styles.kicker}>Pull requests</p>
          <h1>Pull requests</h1>
          <p className={styles.muted}>
            {pulls.length} open PRs across {repoFilter === "all" ? repos.length : 1} tracked {repoFilter === "all" ? "repositories" : "repository"}.
          </p>
        </div>
        <label className={styles.workbenchField}>
          Repo
          <select
            aria-label="Pull request repository filter"
            className={styles.workbenchInput}
            value={repoFilter}
            onChange={(event) => setRepoFilter(event.target.value)}
          >
            <option value="all">All repositories</option>
            {repos.map((repo) => {
              const label = repoLabel(repo);
              return <option key={repo.id} value={label}>{label}</option>;
            })}
          </select>
        </label>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => void loadPulls(reposToLoad, undefined, true)}
        >
          Refresh checks
        </button>
      </header>

      {error && <p role="alert" className={styles.issueFocusError}>{error}</p>}
      {message && <p role="status" className={styles.issueFocusNotice}>{message}</p>}

      <section aria-label="Cross-repo pull requests" style={{ display: "grid", gap: "10px" }}>
        {listStatus === "loading" && <p className={styles.muted}>Loading pull requests.</p>}
        {listStatus === "loaded" && pulls.length === 0 && (
          <p className={styles.muted}>No open pull requests match this repo filter.</p>
        )}
        {pulls.map((pull) => {
          const linkedIssue = linkedIssueNumber(pull.body);
          return (
            <article
              key={pull.key}
              aria-label={`Pull request ${pull.repoLabel} #${pull.number}`}
              data-selected={selectedKey === pull.key ? "true" : undefined}
              data-checks={pull.checksStatus ?? "unknown"}
              style={cardStyle}
            >
              <div style={rowStyle}>
                <strong>{pull.repoLabel} #{pull.number} {pull.title}</strong>
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
              <button type="button" className={styles.secondaryButton} onClick={() => void openPull(pull)}>
                Open PR
              </button>
            </article>
          );
        })}
      </section>

      <section aria-label="Pull request detail" style={cardStyle}>
        {!selectedPull && <p className={styles.muted}>Select a pull request to open details in this focus pane.</p>}
        {selectedPull && detailStatus === "loading" && (
          <p className={styles.issueFocusNotice}>Loading PR {selectedPull.repoLabel} #{selectedPull.number}</p>
        )}
        {selectedPull && detail && (
          <>
            <div style={rowStyle}>
              <h2 style={{ margin: 0 }}>{selectedPull.repoLabel} #{detail.pull.number} {detail.pull.title}</h2>
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

function repoLabel(repo: Pick<WorkbenchRepo, "owner" | "name">): string {
  return `${repo.owner}/${repo.name}`;
}
