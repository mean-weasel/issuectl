"use client";

import { useState, useTransition } from "react";
import type { ClaudeAlias } from "@issuectl/core";
import { addAlias, removeAlias, setDefaultAlias } from "@/lib/actions/aliases";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/ui/Button";
import styles from "./ClaudeAliases.module.css";

type Props = {
  aliases: ClaudeAlias[];
};

export function ClaudeAliases({ aliases: initialAliases }: Props) {
  const [aliases, setAliases] = useState(initialAliases);
  const [newCommand, setNewCommand] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  function handleAdd() {
    if (!newCommand.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addAlias(newCommand, newDescription);
      if (result.success && result.id !== undefined) {
        setAliases((prev) => [
          ...prev,
          {
            id: result.id!,
            command: newCommand.trim(),
            description: newDescription.trim(),
            isDefault: false,
            createdAt: new Date().toISOString(),
          },
        ]);
        setNewCommand("");
        setNewDescription("");
        showToast("Alias added", "success");
      } else {
        setError(result.error ?? "Failed to add alias");
      }
    });
  }

  function handleRemove(id: number) {
    setError(null);
    startTransition(async () => {
      const result = await removeAlias(id);
      if (result.success) {
        setAliases((prev) => prev.filter((a) => a.id !== id));
        showToast("Alias removed", "success");
      } else {
        setError(result.error ?? "Failed to remove alias");
      }
    });
  }

  function handleSetDefault(id: number | null) {
    setError(null);
    startTransition(async () => {
      const result = await setDefaultAlias(id);
      if (result.success) {
        setAliases((prev) =>
          prev.map((a) => ({ ...a, isDefault: a.id === id })),
        );
        showToast(id === null ? "Default cleared" : "Default alias updated", "success");
      } else {
        setError(result.error ?? "Failed to set default");
      }
    });
  }

  const defaultId = aliases.find((a) => a.isDefault)?.id ?? null;

  return (
    <div className={styles.container}>
      {aliases.length > 0 && (
        <div className={styles.list}>
          <div className={styles.listHeader}>
            <span className={styles.colDefault}>Default</span>
            <span className={styles.colCommand}>Command</span>
            <span className={styles.colDescription}>Description</span>
            <span className={styles.colAction} />
          </div>
          {aliases.map((alias) => (
            <div key={alias.id} className={styles.row}>
              <span className={styles.colDefault}>
                <input
                  type="radio"
                  name="defaultAlias"
                  className={styles.radio}
                  checked={alias.isDefault}
                  disabled={isPending}
                  onChange={() => handleSetDefault(alias.id)}
                />
              </span>
              <span className={styles.colCommand}>
                <code className={styles.command}>{alias.command}</code>
              </span>
              <span className={styles.colDescription}>{alias.description}</span>
              <span className={styles.colAction}>
                <button
                  className={styles.removeBtn}
                  onClick={() => handleRemove(alias.id)}
                  disabled={isPending}
                  title="Remove alias"
                >
                  x
                </button>
              </span>
            </div>
          ))}
          {defaultId && (
            <button
              className={styles.clearBtn}
              onClick={() => handleSetDefault(null)}
              disabled={isPending}
            >
              Clear default (use claude)
            </button>
          )}
        </div>
      )}

      <div className={styles.addForm}>
        <input
          className={styles.input}
          placeholder="Command (e.g. yolo)"
          value={newCommand}
          onChange={(e) => setNewCommand(e.target.value)}
          disabled={isPending}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <input
          className={styles.input}
          placeholder="Description (optional)"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          disabled={isPending}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button
          variant="primary"
          onClick={handleAdd}
          disabled={isPending || !newCommand.trim()}
        >
          Save
        </Button>
      </div>

      {aliases.length === 0 && (
        <div className={styles.empty}>
          No aliases configured. Launches will use <code>claude</code> by default.
        </div>
      )}

      {error && <div className={styles.error} role="alert">{error}</div>}
    </div>
  );
}
