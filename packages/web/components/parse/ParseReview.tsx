"use client";

import { useState, useTransition } from "react";
import type { GitHubLabel, ParsedIssuesResponse, BatchCreateResult } from "@issuectl/core";
import type { RepoOption } from "@/lib/types";
import { batchCreateIssues } from "@/lib/actions/parse";
import { Button } from "@/components/paper";
import { ParseIssueCard, type IssueCardState } from "./ParseIssueCard";
import styles from "./ParseReview.module.css";

type Props = {
  parsed: ParsedIssuesResponse;
  repos: RepoOption[];
  labelsPerRepo: Record<string, GitHubLabel[]>;
  onConfirm: (result: BatchCreateResult) => void;
  onBack: () => void;
};

function initCardStates(parsed: ParsedIssuesResponse): IssueCardState[] {
  const orderMap = new Map(parsed.suggestedOrder.map((id, i) => [id, i]));
  return [...parsed.issues]
    .sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999))
    .map((issue) => ({
      id: issue.id,
      title: issue.title,
      body: issue.body,
      type: issue.type,
      owner: issue.repoOwner,
      repo: issue.repoName,
      labels: issue.suggestedLabels,
      accepted: true,
      confidence: issue.repoConfidence,
      clarity: issue.clarity,
      originalText: issue.originalText,
    }));
}

export function ParseReview({
  parsed,
  repos,
  labelsPerRepo,
  onConfirm,
  onBack,
}: Props) {
  const [cards, setCards] = useState(() => initCardStates(parsed));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const accepted = cards.filter((c) => c.accepted);
  const acceptedCount = accepted.length;
  const matchedCount = accepted.filter((c) => c.owner && c.repo).length;
  const draftCount = accepted.filter((c) => !c.owner || !c.repo).length;

  function handleCardChange(updated: IssueCardState) {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      try {
        const reviewed = cards
          .filter((c) => c.accepted)
          .map((c) => ({
            id: c.id,
            title: c.title,
            body: c.body,
            owner: c.owner ?? "",
            repo: c.repo ?? "",
            labels: c.labels,
            accepted: true,
          }));
        const result = await batchCreateIssues(reviewed);
        onConfirm(result);
      } catch (err) {
        setError(
          err instanceof Error
            ? `Failed to create issues: ${err.message}`
            : "An unexpected error occurred while creating issues.",
        );
      }
    });
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.summary}>
        {parsed.issues.length} issue{parsed.issues.length !== 1 ? "s" : ""}{" "}
        parsed &mdash; {acceptedCount} included
        {draftCount > 0 && ` (${draftCount} without repo \u2192 saved as draft${draftCount !== 1 ? "s" : ""})`}
      </div>

      <div className={styles.cards}>
        {cards.map((card) => (
          <ParseIssueCard
            key={card.id}
            issue={card}
            repos={repos}
            labelsPerRepo={labelsPerRepo}
            onChange={handleCardChange}
          />
        ))}
      </div>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      {isPending ? (
        <div className={styles.progressBar} role="status" aria-live="polite">
          <div className={styles.progressTrack}>
            <div className={styles.progressPulse} />
          </div>
          <span className={styles.progressLabel}>
            {matchedCount > 0 && draftCount > 0
              ? `Creating ${matchedCount} issue${matchedCount !== 1 ? "s" : ""} and saving ${draftCount} draft${draftCount !== 1 ? "s" : ""}...`
              : draftCount > 0
                ? `Saving ${draftCount} draft${draftCount !== 1 ? "s" : ""}...`
                : `Creating ${matchedCount} issue${matchedCount !== 1 ? "s" : ""} on GitHub...`}
          </span>
        </div>
      ) : (
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={acceptedCount === 0}
          >
            {acceptedCount === 0
              ? "Select issues to create"
              : matchedCount > 0 && draftCount > 0
                ? `Create ${matchedCount} + Draft ${draftCount}`
                : draftCount > 0
                  ? `Save ${draftCount} Draft${draftCount !== 1 ? "s" : ""}`
                  : `Create ${matchedCount} Issue${matchedCount !== 1 ? "s" : ""}`}
          </Button>
        </div>
      )}
    </div>
  );
}
