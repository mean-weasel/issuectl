"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/paper";
import { useToast } from "@/components/ui/ToastProvider";
import { addComment } from "@/lib/actions/comments";
import styles from "./CommentComposer.module.css";

type Props = {
  owner: string;
  repo: string;
  issueNumber: number;
};

export function CommentComposer({ owner, repo, issueNumber }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (body.trim().length === 0) return;
    setSending(true);
    setError(null);
    try {
      const result = await addComment(owner, repo, issueNumber, body);
      if (!result.success) {
        setError(result.error ?? "Failed to post comment");
      } else {
        setBody("");
        router.refresh();
        if (result.cacheStale) {
          showToast("Comment posted — reload if it doesn't appear", "success");
        }
      }
    } catch {
      setError("Failed to post comment");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className={styles.composer}>
      <div className={styles.label}>add a comment</div>
      <textarea
        className={styles.textarea}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="write a comment…"
        rows={3}
        disabled={sending}
        aria-label="Comment body"
      />
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.footer}>
        <span className={styles.hint}>⌘↩ to send</span>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={sending || body.trim().length === 0}
        >
          {sending ? "sending…" : "comment"}
        </Button>
      </div>
    </div>
  );
}
