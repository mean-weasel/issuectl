"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { addRepo } from "@/lib/actions/repos";
import { Button } from "@/components/paper";
import { useToast } from "@/components/ui/ToastProvider";
import { RepoPicker } from "./RepoPicker";
import styles from "./AddRepoForm.module.css";

type Props = {
  onClose: () => void;
  trackedSet: Set<string>;
};

type RepoIdentity = { owner: string; name: string };

// Discriminated state instead of `mode` + `selected` nullable pair.
// `mode: "selected" && selected === null` was representable before; now it
// isn't — the "selected" variant carries its repo inline.
type FormMode =
  | { kind: "picker" }
  | { kind: "selected"; repo: RepoIdentity }
  | { kind: "manual"; input: string };

function parseManual(input: string): RepoIdentity | null {
  const parts = input.trim().split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], name: parts[1] };
}

export function AddRepoForm({ onClose, trackedSet }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [formMode, setFormMode] = useState<FormMode>({ kind: "picker" });
  const [localPath, setLocalPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleSubmit() {
    setError(null);
    setWarning(null);

    const target =
      formMode.kind === "manual"
        ? parseManual(formMode.input)
        : formMode.kind === "selected"
          ? formMode.repo
          : null;
    if (!target) {
      setError("Format: owner/repo (e.g., mean-weasel/seatify)");
      return;
    }

    startTransition(async () => {
      const result = await addRepo(
        target.owner,
        target.name,
        localPath.trim() || undefined,
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      const { addedRepo } = result;
      const repoHref = `/?repo=${encodeURIComponent(`${addedRepo.owner}/${addedRepo.name}`)}`;
      if (result.warning) {
        setWarning(result.warning);
        timerRef.current = setTimeout(() => {
          onClose();
          router.push(repoHref);
        }, 2000);
      } else {
        showToast("Repository added", "success");
        onClose();
        router.push(repoHref);
      }
    });
  }

  const canSubmit =
    !isPending &&
    (formMode.kind === "manual"
      ? formMode.input.trim().length > 0
      : formMode.kind === "selected");

  return (
    <div className={styles.form}>
      <div className={styles.row}>
        <div className={styles.field}>
          <div className={styles.label}>Repository</div>

          {formMode.kind === "picker" && (
            <RepoPicker
              trackedSet={trackedSet}
              disabled={isPending}
              onSelect={(owner, name) =>
                setFormMode({ kind: "selected", repo: { owner, name } })
              }
              onManualEntry={() => setFormMode({ kind: "manual", input: "" })}
            />
          )}

          {formMode.kind === "selected" && (
            <div className={styles.selected}>
              <span className={styles.selectedDot} />
              <span className={styles.selectedName}>
                {formMode.repo.owner}/{formMode.repo.name}
              </span>
              <button
                type="button"
                className={styles.selectedChange}
                onClick={() => setFormMode({ kind: "picker" })}
                disabled={isPending}
              >
                change
              </button>
            </div>
          )}

          {formMode.kind === "manual" && (
            <div className={styles.manual}>
              <input
                className={styles.input}
                value={formMode.input}
                onChange={(e) =>
                  setFormMode({ kind: "manual", input: e.target.value })
                }
                placeholder="owner/repo (e.g., mean-weasel/seatify)"
                disabled={isPending}
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
              />
              <button
                type="button"
                className={styles.backLink}
                onClick={() => setFormMode({ kind: "picker" })}
                disabled={isPending}
              >
                &larr; back to picker
              </button>
            </div>
          )}
        </div>

        <div className={styles.field}>
          <div className={styles.label}>Local Path (optional)</div>
          <input
            className={styles.input}
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            placeholder="~/Desktop/my-repo"
            disabled={isPending}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <div className={styles.pathHint}>Leave blank to prompt on launch</div>
        </div>
      </div>

      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
      {warning && (
        <span className={styles.warning} role="status">
          {warning}
        </span>
      )}

      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {isPending ? "Adding..." : "Add Repo"}
        </Button>
      </div>
    </div>
  );
}
