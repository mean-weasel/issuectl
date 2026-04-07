"use client";

import { useState, useTransition } from "react";
import { removeRepo, updateRepo } from "@/lib/actions/repos";
import { Button } from "@/components/ui/Button";
import type { Repo } from "@issuectl/core";
import styles from "./RepoRow.module.css";

type Props = {
  repo: Repo;
  color: string;
};

export function RepoRow({ repo, color }: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [localPath, setLocalPath] = useState(repo.localPath ?? "");
  const [branchPattern, setBranchPattern] = useState(repo.branchPattern ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateRepo(repo.id, {
        localPath: localPath || undefined,
        branchPattern: branchPattern || undefined,
      });
      if (result.success) {
        setMode("view");
      } else {
        setError(result.error ?? "Failed to save");
      }
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeRepo(repo.id);
      if (!result.success) {
        setError(result.error ?? "Failed to remove");
        setMode("view");
      }
    });
  }

  if (mode === "confirm") {
    return (
      <div className={styles.confirmOverlay}>
        <span className={styles.confirmText}>
          Remove <strong>{repo.owner}/{repo.name}</strong>? This cannot be undone.
        </span>
        <div className={styles.confirmActions}>
          <Button
            variant="ghost"
            onClick={() => setMode("view")}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={handleRemove}
            disabled={isPending}
            className={styles.dangerBtn}
          >
            {isPending ? "Removing..." : "Remove"}
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "edit") {
    return (
      <div className={styles.editForm}>
        <div className={styles.editRow}>
          <div className={styles.editField}>
            <div className={styles.editLabel}>Local Path</div>
            <input
              className={styles.editInput}
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              placeholder="~/Desktop/my-repo"
            />
          </div>
          <div className={styles.editField}>
            <div className={styles.editLabel}>Branch Pattern</div>
            <input
              className={styles.editInput}
              value={branchPattern}
              onChange={(e) => setBranchPattern(e.target.value)}
              placeholder="issue-{number}-{slug}"
            />
          </div>
        </div>
        {error && (
          <span className={styles.error} role="alert">{error}</span>
        )}
        <div className={styles.editActions}>
          <Button variant="ghost" onClick={() => setMode("view")} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  const hasPath = !!repo.localPath;

  return (
    <div className={hasPath ? styles.row : styles.rowNoPath}>
      <span
        className={hasPath ? styles.dot : styles.dotNoPath}
        style={hasPath ? { background: color } : undefined}
      />
      <span className={hasPath ? styles.name : styles.nameNoPath}>
        {repo.owner}/{repo.name}
      </span>
      <span className={hasPath ? styles.path : styles.noPath}>
        {repo.localPath ?? "no local path \u2014 will prompt to clone"}
      </span>
      <div className={styles.actions}>
        <Button
          variant="ghost"
          className={styles.actionBtn}
          onClick={() => setMode("edit")}
        >
          {hasPath ? "Edit" : "Set path"}
        </Button>
        <Button
          variant="ghost"
          className={styles.dangerBtn}
          onClick={() => setMode("confirm")}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}
