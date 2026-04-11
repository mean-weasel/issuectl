"use client";

import { useState, useRef } from "react";
import type { Draft } from "@issuectl/core";
import { Chip } from "@/components/paper";
import { DetailTopBar } from "./DetailTopBar";
import { DetailMeta, MetaSeparator } from "./DetailMeta";
import { updateDraftAction } from "@/lib/actions/drafts";
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
  const [body, setBody] = useState(draft.body ?? "");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBlur = async () => {
    // Only save if body actually changed from the draft's current body.
    const trimmed = body;
    if (trimmed === (draft.body ?? "")) return;

    setSaveError(null);
    try {
      await updateDraftAction(draft.id, { body: trimmed });
      setSavedAt(Date.now());
      // Clear the "saved" indicator after 3 seconds.
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSavedAt(null), 3000);
    } catch {
      setSaveError("Failed to save — try again");
    }
  };

  return (
    <div className={styles.container}>
      <DetailTopBar backHref="/" crumb={<em>draft</em>} />
      <div className={styles.body}>
        <h1 className={styles.title}>{draft.title}</h1>
        <DetailMeta>
          <Chip variant="dashed">no repo</Chip>
          <MetaSeparator />
          <span>priority: {draft.priority}</span>
          <MetaSeparator />
          <span>{formatUnix(draft.updatedAt)}</span>
        </DetailMeta>
        <div className={styles.hint}>
          this is a local draft — it lives only on your machine until you
          assign it to a repo.
        </div>
        <div className={styles.bodyEditor}>
          <textarea
            className={styles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={handleBlur}
            placeholder="add a description…"
            rows={8}
          />
          {savedAt !== null && (
            <div className={styles.savedIndicator}>saved</div>
          )}
          {saveError && (
            <div className={styles.saveError}>{saveError}</div>
          )}
        </div>
      </div>
    </div>
  );
}
