"use client";

import { useState, useEffect, useRef } from "react";
import { useCommentDraft } from "@/hooks/useCommentDraft";
import { useImageUpload } from "@/hooks/useImageUpload";
import { useRouter } from "next/navigation";
import { Button } from "@/components/paper";
import { useToast } from "@/components/ui/ToastProvider";
import { SyncDot } from "@/components/ui/SyncDot";
import { addComment } from "@/lib/actions/comments";
import { tryOrQueue } from "@/lib/tryOrQueue";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import styles from "./CommentComposer.module.css";

const MIN_SYNC_DOT_MS = 1500;

type Props = {
  owner: string;
  repo: string;
  issueNumber: number;
  onCommentPosted?: (body: string) => void;
};

export function CommentComposer({ owner, repo, issueNumber, onCommentPosted }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const { body, setBody, clear: clearDraft } = useCommentDraft(owner, repo, issueNumber);
  const [sending, setSending] = useState(false);
  const [syncVisible, setSyncVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncStartRef = useRef(0);
  const {
    uploading,
    dragging,
    fileInputRef,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    openFilePicker,
    handleFileSelect,
  } = useImageUpload({
    setBody,
    owner,
    repo,
    onError: (msg) => showToast(msg, "error"),
  });

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
      const nonce = newIdempotencyKey();
      const result = await tryOrQueue(
        "addComment",
        { owner, repo, issueNumber, body },
        () => addComment(owner, repo, issueNumber, body, nonce),
        { nonce },
      );

      if (result.outcome === "queued") {
        clearDraft();
        showToast("Comment queued — will sync when online", "warning");
        return;
      }

      if (result.outcome === "error") {
        setError(result.error);
        return;
      }

      // succeeded — notify parent outside try so a callback bug
      // doesn't produce a misleading "Failed to post comment" error
      try { onCommentPosted?.(body); } catch (e) {
        console.error("[issuectl] onCommentPosted callback failed:", e);
      }
      clearDraft();
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
      <div className={`${styles.textareaWrap} ${dragging ? styles.textareaDragging : ""}`}>
        <textarea
          className={styles.textarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPaste={handlePaste}
          placeholder="write a comment…"
          rows={3}
          disabled={sending}
          aria-label="Comment body"
          maxLength={65536}
          autoComplete="off"
          autoCapitalize="sentences"
          spellCheck={true}
          enterKeyHint="send"
        />
      </div>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.attachBtn}
          onClick={openFilePicker}
          disabled={sending || uploading}
          aria-label="Attach image"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3M11 5l-3-3-3 3M8 2v9" />
          </svg>
          {uploading ? "uploading…" : "attach"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          onChange={handleFileSelect}
          className={styles.hiddenInput}
          tabIndex={-1}
        />
        <span className={styles.hint}>⌘↩ to send</span>
        {syncVisible && <SyncDot status="syncing" label="syncing comment" />}
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={sending || uploading || body.trim().length === 0}
        >
          {sending ? "sending…" : "comment"}
        </Button>
      </div>
    </div>
  );
}
