"use client";

import type { WorkspaceMode } from "@issuectl/core";
import { cn } from "@/lib/cn";
import styles from "./WorkspaceModeSelector.module.css";

type Props = {
  value: WorkspaceMode;
  onChange: (value: WorkspaceMode) => void;
  repoLocalPath: string | null;
  repo: string;
  issueNumber: number;
};

type Option = {
  mode: WorkspaceMode;
  label: string;
  detail: string;
};

export function WorkspaceModeSelector({
  value,
  onChange,
  repoLocalPath,
  repo,
  issueNumber,
}: Props) {
  const options: Option[] = [
    {
      mode: "existing",
      label: "Existing repo",
      detail: repoLocalPath ?? "No local path configured",
    },
    {
      mode: "worktree",
      label: "Git worktree",
      detail: `~/.issuectl/worktrees/${repo}-issue-${issueNumber}/ · isolated, fast, shared history`,
    },
    {
      mode: "clone",
      label: "Fresh clone",
      detail: `~/.issuectl/worktrees/${repo}-issue-${issueNumber}/ · fully isolated, slower`,
    },
  ];

  return (
    <div className={styles.field}>
      <div className={styles.label}>Workspace</div>
      <div className={styles.options}>
        {options.map((opt) => {
          const isSelected = value === opt.mode;
          const isDisabled = opt.mode === "existing" && !repoLocalPath;
          return (
            <label
              key={opt.mode}
              className={cn(
                styles.option,
                isSelected && styles.selected,
                isDisabled && styles.disabled,
              )}
            >
              <input
                type="radio"
                name="workspace"
                className={styles.radio}
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => onChange(opt.mode)}
              />
              <div>
                <div className={styles.optionLabel}>{opt.label}</div>
                <div className={styles.optionDetail}>{opt.detail}</div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
