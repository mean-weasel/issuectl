"use client";

import { useState } from "react";
import { Button, Sheet } from "@/components/paper";
import { createDraftAction } from "@/lib/actions/drafts";
import styles from "./CreateDraftSheet.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CreateDraftSheet({ open, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Defense in depth: createDraft in core also validates the title, and
  // createDraftAction validates at the server boundary. The client-side
  // check here is a UX affordance — avoids a server round-trip just to
  // surface "title required."
  const handleSave = async () => {
    if (title.trim().length === 0) {
      setError("A title is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createDraftAction({ title });
      setTitle("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setTitle("");
    setError(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="New draft"
      description={<em>a local draft without a repo — assign it later</em>}
    >
      <div className={styles.form}>
        <input
          className={styles.input}
          placeholder="What needs to be done?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={saving}
          autoFocus
        />
        <div className={styles.hint}>
          title only — add a body, labels, and a repo when you assign it
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.actions}>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>
            cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "saving…" : "save draft"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
