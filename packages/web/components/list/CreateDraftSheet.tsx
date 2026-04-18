"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Sheet } from "@/components/paper";
import { createDraftAction } from "@/lib/actions/drafts";
import styles from "./CreateDraftSheet.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CreateDraftSheet({ open, onClose }: Props) {
  const router = useRouter();
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
      const result = await createDraftAction({ title });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setTitle("");
      onClose();
      router.push("/?section=unassigned");
    } catch {
      setError("Failed to save draft");
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
        <label htmlFor="create-draft-title" className={styles.label}>
          Title
        </label>
        <input
          id="create-draft-title"
          className={styles.input}
          placeholder="What needs to be done?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={saving}
          autoFocus
          maxLength={256}
          autoComplete="off"
          autoCapitalize="sentences"
          autoCorrect="on"
          spellCheck
          enterKeyHint="done"
          style={title.length > 50 ? { fontSize: 20, lineHeight: 1.3 } : undefined}
        />
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.actions}>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>
            cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || title.trim().length === 0}>
            {saving ? "saving…" : "save draft"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
