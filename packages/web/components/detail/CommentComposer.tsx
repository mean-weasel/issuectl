"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/paper";
import { useToast } from "@/components/ui/ToastProvider";
import { addComment } from "@/lib/actions/comments";
import { tryOrQueue } from "@/lib/tryOrQueue";
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
      const result = await tryOrQueue(
        "addComment",
        { owner, repo, issueNumber, body },
        () => addComment(owner, repo, issueNumber, body),
      );

      if (result.outcome === "queued") {
        setBody("");
        showToast("Comment queued — will sync when online", "warning");
        return;
      }

      if (result.outcome === "error") {
        setError(result.error);
        return;
      }

      // succeeded
      setBody("");
      router.refresh();
      const data = result.data as { cacheStale?: boolean };
      showToast(
        data.cacheStale
          ? "Comment posted — reload if it doesn't appear"
          : "Comment posted",
        "success",
      );
    } catch (err) {
      console.error("[issuectl] addComment threw:", err);
      setError(err instanceof Error ? err.message : "Failed to post comment");
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
