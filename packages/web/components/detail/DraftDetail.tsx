"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Draft } from "@issuectl/core";
import { Chip } from "@/components/paper";
import { DetailTopBar } from "./DetailTopBar";
import { DetailMeta, MetaSeparator } from "./DetailMeta";
import { DraftActionSheet } from "./DraftActionSheet";
import { createDraftAction, updateDraftAction } from "@/lib/actions/drafts";
import { useUnsavedWarning } from "@/hooks/useUnsavedWarning";
import styles from "./DraftDetail.module.css";

type Props = {
  draft: Draft;
};

function formatUnix(updatedAt: number): string {
  const t = updatedAt * 1000;
  const diffDays = Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
  if (diffDays < 1) return "today";
  if (diffDays === 1) return "1d old";
  return `${diffDays}d old`;
}

export function DraftDetail({ draft }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body ?? "");
  const titleDirty = title !== draft.title;
  const bodyDirty = body !== (draft.body ?? "");
  useUnsavedWarning(titleDirty || bodyDirty);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftDeleted, setDraftDeleted] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flashSaved() {
    setSavedAt(Date.now());
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSavedAt(null), 3000);
  }

  const handleTitleBlur = async () => {
    const trimmed = title.trim();
    if (trimmed.length === 0 || trimmed === draft.title) {
      if (trimmed.length === 0) setTitle(draft.title);
      return;
    }
    setSaveError(null);
    try {
      const result = await updateDraftAction(draft.id, { title: trimmed });
      if (!result.success) {
        if (result.code === "NOT_FOUND") {
          setDraftDeleted(true);
        }
        setSaveError(result.error ?? "Failed to save title");
        return;
      }
      flashSaved();
    } catch (err) {
      console.error("[issuectl] updateDraft title threw:", err);
      setSaveError(
        err instanceof Error ? err.message : "Failed to save title — try again",
      );
    }
  };

  const handleBodyBlur = async () => {
    if (body === (draft.body ?? "")) return;
    setSaveError(null);
    try {
      const result = await updateDraftAction(draft.id, { body });
      if (!result.success) {
        if (result.code === "NOT_FOUND") {
          setDraftDeleted(true);
        }
        setSaveError(result.error ?? "Failed to save");
        return;
      }
      flashSaved();
    } catch (err) {
      console.error("[issuectl] updateDraft body threw:", err);
      setSaveError(
        err instanceof Error ? err.message : "Failed to save — try again",
      );
    }
  };

  const handleSaveAsNew = async () => {
    if (savingNew) return;
    setSavingNew(true);
    setSaveError(null);
    try {
      const result = await createDraftAction({
        title: title.trim() || "Untitled draft",
        body: body || undefined,
      });
      if (!result.success) {
        setSaveError(result.error ?? "Failed to save as new draft");
        return;
      }
      router.replace(`/drafts/${result.id}`);
    } catch (err) {
      console.error("[issuectl] Save as new draft failed:", err);
      setSaveError("Failed to save as new draft");
    } finally {
      setSavingNew(false);
    }
  };

  return (
    <div className={styles.container}>
      <DetailTopBar backHref="/" crumb={<em>draft</em>} />
      <div className={styles.body}>
        <h1 className={styles.srOnly}>{title || "Untitled draft"}</h1>
        <input
          className={styles.titleInput}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          aria-label="Draft title"
          maxLength={256}
          autoComplete="off"
          autoCapitalize="sentences"
          spellCheck={true}
          enterKeyHint="done"
        />
        <DetailMeta>
          <Chip variant="dashed">no repo</Chip>
          <MetaSeparator />
          <span>priority: {draft.priority}</span>
          <MetaSeparator />
          <span>{formatUnix(draft.updatedAt)}</span>
        </DetailMeta>
        <div className={styles.bodyEditor}>
          <textarea
            className={styles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={handleBodyBlur}
            placeholder="add a description…"
            rows={8}
            maxLength={65536}
            autoComplete="off"
            autoCapitalize="sentences"
            spellCheck={true}
          />
          {savedAt !== null && (
            <div
              className={styles.savedIndicator}
              role="status"
              aria-live="polite"
            >
              saved
            </div>
          )}
          {saveError && (
            <div className={styles.saveError} role="alert">
              {saveError}
            </div>
          )}
          {draftDeleted && (
            <div className={styles.recoveryBar}>
              <span>This draft was deleted.</span>
              <button className={styles.recoveryBtn} onClick={handleSaveAsNew} disabled={savingNew}>
                {savingNew ? "Saving…" : "Save as new draft"}
              </button>
            </div>
          )}
        </div>
      </div>
      <DraftActionSheet
        draftId={draft.id}
        // Use the persisted title so the preview matches what gets created on
        // GitHub. Unsaved edits to `title` state only commit on blur.
        draftTitle={draft.title}
      />
    </div>
  );
}
