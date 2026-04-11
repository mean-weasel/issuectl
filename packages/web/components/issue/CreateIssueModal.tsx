"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GitHubLabel } from "@issuectl/core";
import { createIssue } from "@/lib/actions/issues";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/paper";
import type { RepoOption } from "@/lib/types";
import { LabelSelector } from "./LabelSelector";
import styles from "./CreateIssueModal.module.css";

type Props = {
  repos: RepoOption[];
  defaultRepo: RepoOption;
  availableLabels: GitHubLabel[];
  onClose: () => void;
};

export function CreateIssueModal({
  repos,
  defaultRepo,
  availableLabels,
  onClose,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [selectedRepo, setSelectedRepo] = useState(defaultRepo);
  const [showRepoSelect, setShowRepoSelect] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);

  function handleToggleLabel(label: string) {
    setSelectedLabels((prev) =>
      prev.includes(label)
        ? prev.filter((l) => l !== label)
        : [...prev, label],
    );
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createIssue({
        owner: selectedRepo.owner,
        repo: selectedRepo.repo,
        title,
        body: body || undefined,
        labels: selectedLabels.length > 0 ? selectedLabels : undefined,
      });

      if (!result.success) {
        setError(result.error ?? "Failed to create issue");
        return;
      }

      showToast("Issue created", "success");
      router.push(
        `/${selectedRepo.owner}/${selectedRepo.repo}/issues/${result.issueNumber}`,
      );
      onClose();
    });
  }

  return (
    <Modal
      title="Create Issue"
      onClose={onClose}
      disabled={isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isPending || !title.trim()}
          >
            {isPending ? "Creating..." : "Create Issue"}
          </Button>
        </>
      }
    >
      <div className={styles.field}>
        <div className={styles.label}>Repository</div>
        {showRepoSelect ? (
          <div className={styles.repoList}>
            {repos.map((r) => (
              <button
                key={`${r.owner}/${r.repo}`}
                type="button"
                className={styles.repoOption}
                onClick={() => {
                  setSelectedRepo(r);
                  setShowRepoSelect(false);
                }}
              >
                <span className={styles.repoDot} />
                {r.owner}/{r.repo}
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.repoDisplay}>
            <span className={styles.repoDot} />
            <span className={styles.repoName}>
              {selectedRepo.owner}/{selectedRepo.repo}
            </span>
            {repos.length > 1 && (
              <button
                type="button"
                className={styles.changeLink}
                onClick={() => setShowRepoSelect(true)}
              >
                change
              </button>
            )}
          </div>
        )}
      </div>

      <div className={styles.field}>
        <div className={styles.label}>Title</div>
        <input
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Issue title"
          autoFocus
          disabled={isPending}
        />
      </div>

      <div className={styles.field}>
        <div className={styles.label}>
          Description <span className={styles.hint}>(markdown)</span>
        </div>
        <textarea
          className={styles.textarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Describe the issue..."
          disabled={isPending}
        />
      </div>

      {availableLabels.length > 0 && (
        <div className={styles.field}>
          <div className={styles.label}>Labels</div>
          <LabelSelector
            available={availableLabels}
            selected={selectedLabels}
            onToggle={handleToggleLabel}
            disabled={isPending}
          />
        </div>
      )}

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}
