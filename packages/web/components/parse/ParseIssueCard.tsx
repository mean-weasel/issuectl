"use client";

import type { GitHubLabel, ParsedIssueType, ParsedIssueClarity } from "@issuectl/core";
import type { RepoOption } from "@/lib/types";
import { LabelSelector } from "@/components/issue/LabelSelector";
import styles from "./ParseIssueCard.module.css";

export type IssueCardState = {
  id: string;
  title: string;
  body: string;
  type: ParsedIssueType;
  owner: string | null;
  repo: string | null;
  labels: string[];
  accepted: boolean;
  confidence: number;
  clarity: ParsedIssueClarity;
  originalText: string;
};

type Props = {
  issue: IssueCardState;
  repos: RepoOption[];
  labelsPerRepo: Record<string, GitHubLabel[]>;
  onChange: (updated: IssueCardState) => void;
};

function confidenceLabel(confidence: number) {
  if (confidence >= 0.7) return { text: `${Math.round(confidence * 100)}%`, className: styles.confidenceHigh };
  if (confidence >= 0.5) return { text: `${Math.round(confidence * 100)}%`, className: styles.confidenceMedium };
  return { text: "unmatched", className: styles.confidenceLow };
}

export function ParseIssueCard({ issue, repos, labelsPerRepo, onChange }: Props) {
  const repoKey = issue.owner && issue.repo ? `${issue.owner}/${issue.repo}` : "";
  const availableLabels = repoKey ? (labelsPerRepo[repoKey] ?? []) : [];
  const isUnmatched = !issue.owner || !issue.repo;
  const conf = confidenceLabel(issue.confidence);

  function handleRepoChange(value: string) {
    if (!value) {
      onChange({ ...issue, owner: null, repo: null, labels: [] });
      return;
    }
    const [owner, repo] = value.split("/");
    const newRepoLabels = labelsPerRepo[value] ?? [];
    const newLabelNames = new Set(newRepoLabels.map((l) => l.name));
    const validLabels = issue.labels.filter((l) => newLabelNames.has(l));
    onChange({ ...issue, owner, repo, labels: validLabels });
  }

  function handleToggleLabel(label: string) {
    const labels = issue.labels.includes(label)
      ? issue.labels.filter((l) => l !== label)
      : [...issue.labels, label];
    onChange({ ...issue, labels });
  }

  let cardClass = styles.card;
  if (!issue.accepted) cardClass = styles.cardRejected;
  else if (isUnmatched) cardClass = styles.cardUnmatched;

  return (
    <div className={cardClass}>
      <div className={styles.header}>
        <span className={styles.typeBadge}>{issue.type}</span>
        <span className={conf.className}>{conf.text}</span>
        <div className={styles.headerSpacer} />
        <button
          type="button"
          className={issue.accepted ? styles.toggleButtonActive : styles.toggleButton}
          onClick={() => onChange({ ...issue, accepted: !issue.accepted })}
        >
          {issue.accepted ? "Included" : "Excluded"}
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.originalText}>{issue.originalText}</div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Title</label>
          <input
            className={styles.input}
            value={issue.title}
            onChange={(e) => onChange({ ...issue, title: e.target.value })}
            disabled={!issue.accepted}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Body (markdown)</label>
          <textarea
            className={styles.textarea}
            value={issue.body}
            onChange={(e) => onChange({ ...issue, body: e.target.value })}
            disabled={!issue.accepted}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Repository</label>
          <select
            className={isUnmatched ? styles.selectUnmatched : styles.select}
            value={repoKey}
            onChange={(e) => handleRepoChange(e.target.value)}
            disabled={!issue.accepted}
          >
            <option value="">Select a repo...</option>
            {repos.map((r) => (
              <option key={`${r.owner}/${r.repo}`} value={`${r.owner}/${r.repo}`}>
                {r.owner}/{r.repo}
              </option>
            ))}
          </select>
        </div>

        {availableLabels.length > 0 && (
          <div className={styles.labelsRow}>
            <span className={styles.fieldLabel}>Labels</span>
            <LabelSelector
              available={availableLabels}
              selected={issue.labels}
              onToggle={handleToggleLabel}
              disabled={!issue.accepted}
            />
          </div>
        )}
      </div>
    </div>
  );
}
