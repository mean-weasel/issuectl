"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LightboxBodyText } from "./LightboxBodyText";
import { Button } from "@/components/paper";
import { updateIssue } from "@/lib/actions/issues";
import { useToast } from "@/components/ui/ToastProvider";
import styles from "./EditableBody.module.css";

type Props = {
  owner: string;
  repo: string;
  issueNumber: number;
  initialBody: string | null;
};

export function EditableBody({ owner, repo, issueNumber, initialBody }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(initialBody ?? "");
  const [displayBody, setDisplayBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);

  // Sync with server data when not editing (e.g. after router.refresh()
  // or if another user edits the body via the GitHub UI).
  useEffect(() => {
    if (!editing) {
      setDisplayBody(initialBody);
      setBody(initialBody ?? "");
    }
  }, [initialBody, editing]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await updateIssue({ owner, repo, number: issueNumber, body });
      if (!result.success) {
        showToast(result.error ?? "Failed to update", "error");
        return;
      }
      setDisplayBody(body);
      setEditing(false);
      router.refresh();
      showToast(
        result.cacheStale
          ? "Description updated — reload if changes don't appear"
          : "Description updated",
        "success",
      );
    } catch (err) {
      console.error("[issuectl] updateIssue failed:", err);
      showToast("Failed to update description", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setBody(displayBody ?? "");
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSave();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  if (editing) {
    return (
      <div className={styles.editor}>
        <textarea
          className={styles.textarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={10}
          disabled={saving}
          autoFocus
          maxLength={65536}
          aria-label="Edit issue body"
        />
        <div className={styles.actions}>
          <span className={styles.editHint}>{"\u2318\u21A9 to save \u00B7 esc to cancel"}</span>
          <Button variant="ghost" onClick={handleCancel} disabled={saving}>
            cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "saving\u2026" : "save"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.bodyWrap}>
      <button
        className={styles.editBtn}
        onClick={() => {
          setBody(displayBody ?? "");
          setEditing(true);
        }}
        aria-label="Edit description"
      >
        edit
      </button>
      <LightboxBodyText body={displayBody} />
    </div>
  );
}
