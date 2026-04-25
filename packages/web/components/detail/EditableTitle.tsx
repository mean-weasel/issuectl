"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/paper";
import { updateIssue } from "@/lib/actions/issues";
import { useToast } from "@/components/ui/ToastProvider";
import styles from "./EditableTitle.module.css";

type Props = {
  owner: string;
  repo: string;
  issueNumber: number;
  initialTitle: string;
};

export function EditableTitle({ owner, repo, issueNumber, initialTitle }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [displayTitle, setDisplayTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      setDisplayTitle(initialTitle);
      setTitle(initialTitle);
    }
  }, [initialTitle, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      showToast("Title cannot be empty", "error");
      return;
    }
    if (trimmed === displayTitle) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const result = await updateIssue({ owner, repo, number: issueNumber, title: trimmed });
      if (!result.success) {
        showToast(result.error ?? "Failed to update title", "error");
        return;
      }
      setDisplayTitle(trimmed);
      setTitle(trimmed);
      setEditing(false);
      router.refresh();
      showToast(
        result.cacheStale
          ? "Title updated — reload if changes don't appear"
          : "Title updated",
        "success",
      );
    } catch (err) {
      console.error("[issuectl] updateIssue title failed:", err);
      showToast("Failed to update title", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setTitle(displayTitle);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !saving) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  if (editing) {
    return (
      <div className={styles.editor}>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={saving}
          maxLength={256}
          aria-label="Edit issue title"
        />
        <div className={styles.actions}>
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
    <div className={styles.titleWrap}>
      <h1 className={styles.title}>{displayTitle}</h1>
      <button
        className={styles.editBtn}
        onClick={() => {
          setTitle(displayTitle);
          setEditing(true);
        }}
        aria-label="Edit title"
      >
        edit
      </button>
    </div>
  );
}
