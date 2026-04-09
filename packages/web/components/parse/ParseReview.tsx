"use client";

import { useState, useTransition } from "react";
import type { GitHubLabel, ParsedIssuesResponse, BatchCreateResult } from "@issuectl/core";
import type { RepoOption } from "@/lib/types";
import { batchCreateIssues } from "@/lib/actions/parse";
import { Button } from "@/components/ui/Button";
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

  const acceptedCount = cards.filter((c) => c.accepted).length;
  const unmatchedAccepted = cards.filter(
    (c) => c.accepted && (!c.owner || !c.repo),
  );

  function handleCardChange(updated: IssueCardState) {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  function handleCreate() {
    if (unmatchedAccepted.length > 0) {
      setError("All included issues must have a repository selected.");
      return;
    }
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
        parsed &mdash; {acceptedCount} included for creation
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

      <div className={styles.footer}>
        <Button variant="secondary" onClick={onBack} disabled={isPending}>
          Back
        </Button>
        <Button
          variant="primary"
          onClick={handleCreate}
          disabled={isPending || acceptedCount === 0}
        >
          {isPending
            ? "Creating..."
            : `Create ${acceptedCount} Issue${acceptedCount !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </div>
  );
}
