"use client";

import { useState, useTransition } from "react";
import type { GitHubIssue } from "@issuectl/core";
import { updateIssue } from "@/lib/actions/issues";
import { Button } from "@/components/ui/Button";
import styles from "./EditIssueForm.module.css";

type Props = {
  owner: string;
  repo: string;
  issue: GitHubIssue;
  onDone: () => void;
};

export function EditIssueForm({ owner, repo, issue, onDone }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(issue.title);
  const [body, setBody] = useState(issue.body ?? "");

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateIssue({
        owner,
        repo,
        number: issue.number,
        title: title.trim(),
        body,
      });

      if (!result.success) {
        setError(result.error ?? "Failed to update issue");
        return;
      }

      onDone();
    });
  }

  return (
    <div className={styles.form}>
      <input
        className={styles.titleInput}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Issue title"
        disabled={isPending}
        autoFocus
      />
      <textarea
        className={styles.bodyInput}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Description (markdown)"
        disabled={isPending}
      />
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={isPending || !title.trim()}
        >
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
