"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/paper";
import { useToast } from "@/components/ui/ToastProvider";
import { SyncDot } from "@/components/ui/SyncDot";
import { addComment } from "@/lib/actions/comments";
import styles from "./CommentComposer.module.css";

const MIN_SYNC_DOT_MS = 1500;

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
  const [syncVisible, setSyncVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncStartRef = useRef(0);

  // Keep the syncing dot visible for at least one full pulse cycle (1.2s
  // animation in SyncDot.module.css). The 1500ms buffer prevents mid-fade
  // disappearance when the API responds faster than one cycle.
  useEffect(() => {
    if (sending) {
      syncStartRef.current = Date.now();
      setSyncVisible(true);
      return;
    }
    if (!syncVisible) return;
    const elapsed = Date.now() - syncStartRef.current;
    const remaining = Math.max(0, MIN_SYNC_DOT_MS - elapsed);
    const timer = setTimeout(() => setSyncVisible(false), remaining);
    return () => clearTimeout(timer);
  }, [sending]); // syncVisible intentionally omitted — it's a gate, not a reactive dep

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
        showToast(
          result.cacheStale
            ? "Comment posted — reload if it doesn't appear"
            : "Comment posted",
          "success",
        );
      }
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
        {syncVisible && <SyncDot status="syncing" label="syncing comment" />}
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
