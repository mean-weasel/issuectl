"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GitHubLabel } from "@issuectl/core";
import { createIssue } from "@/lib/actions/issues";
import { useToast } from "@/components/ui/ToastProvider";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { isLifecycleLabel } from "@/lib/labels";
import type { RepoOption } from "@/lib/types";
import styles from "./NewIssuePage.module.css";

type Props = {
  repos: RepoOption[];
  defaultRepo: RepoOption;
  labelsPerRepo: Record<string, GitHubLabel[]>;
  initError?: string;
};

function selectedChipStyle(label: GitHubLabel): React.CSSProperties {
  if (label.color) {
    return {
      background: `#${label.color}18`,
      color: `#${label.color}`,
      borderColor: `#${label.color}50`,
    };
  }
  return {};
}

export function NewIssuePage({ repos, defaultRepo, labelsPerRepo, initError }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [selectedRepo, setSelectedRepo] = useState(defaultRepo);
  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const repoKey = `${selectedRepo.owner}/${selectedRepo.repo}`;
  const availableLabels = useMemo(
    () => (labelsPerRepo[repoKey] ?? []).filter((l) => !isLifecycleLabel(l.name)),
    [labelsPerRepo, repoKey],
  );

  function handleSelectRepo(repo: RepoOption) {
    setSelectedRepo(repo);
    setShowRepoPicker(false);
    // Labels are per-repo — clearing avoids sending labels that don't exist on the new repo.
    setSelectedLabels([]);
  }

  function handleToggleLabel(name: string) {
    setSelectedLabels((prev) =>
      prev.includes(name) ? prev.filter((l) => l !== name) : [...prev, name],
    );
  }

  function handleSubmit() {
    setError(null);
    const idempotencyKey = newIdempotencyKey();
    startTransition(async () => {
      const result = await createIssue({
        owner: selectedRepo.owner,
        repo: selectedRepo.repo,
        title,
        body: body || undefined,
        labels: selectedLabels.length > 0 ? selectedLabels : undefined,
        idempotencyKey,
      });

      if (!result.success) {
        setError(result.error ?? "Failed to create issue");
        return;
      }

      showToast("Issue created", "success");
      router.push(
        `/${selectedRepo.owner}/${selectedRepo.repo}/issues/${result.issueNumber}`,
      );
    });
  }

  const canSubmit = title.trim().length > 0 && !isPending;

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <Link href="/" className={styles.back} aria-label="Back to dashboard">
          ←
        </Link>
        <span className={styles.pageTitle}>New Issue</span>
        <button
          type="button"
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {isPending ? "Creating…" : "Create"}
        </button>
      </div>

      <div className={styles.form}>
        {initError && (
          <div className={styles.initError} role="alert">
            Couldn't load labels from GitHub: {initError}. You can still create
            the issue — label chips will be empty.
          </div>
        )}

        <div className={styles.field}>
          <div className={styles.fieldLabel}>Repository</div>
          {showRepoPicker ? (
            <div className={styles.repoList}>
              {repos.map((r) => {
                const isSelected =
                  r.owner === selectedRepo.owner && r.repo === selectedRepo.repo;
                return (
                  <button
                    key={`${r.owner}/${r.repo}`}
                    type="button"
                    className={`${styles.repoOption} ${isSelected ? styles.repoOptionSelected : ""}`}
                    onClick={() => handleSelectRepo(r)}
                  >
                    <span className={styles.repoDot} />
                    {r.owner}/{r.repo}
                  </button>
                );
              })}
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
                  className={styles.repoChange}
                  onClick={() => setShowRepoPicker(true)}
                >
                  change
                </button>
              )}
            </div>
          )}
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>Title</div>
          <input
            type="text"
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's the issue?"
            autoFocus
            disabled={isPending}
            maxLength={256}
            autoComplete="off"
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck
            enterKeyHint="next"
          />
        </div>

        <div className={styles.field}>
          <div className={styles.fieldLabel}>
            Description <span className={styles.fieldHint}>(markdown)</span>
          </div>
          <textarea
            className={styles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe the issue..."
            disabled={isPending}
            maxLength={65536}
            rows={4}
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck
            enterKeyHint="enter"
          />
        </div>

        {availableLabels.length > 0 && (
          <div className={styles.field}>
            <div className={styles.fieldLabel}>Labels</div>
            <div className={styles.labelChips}>
              {availableLabels.map((label) => {
                const isSelected = selectedLabels.includes(label.name);
                return (
                  <button
                    key={label.name}
                    type="button"
                    className={
                      isSelected ? styles.labelChipSelected : styles.labelChip
                    }
                    style={isSelected ? selectedChipStyle(label) : undefined}
                    onClick={() => handleToggleLabel(label.name)}
                    aria-pressed={isSelected}
                    disabled={isPending}
                  >
                    {label.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
