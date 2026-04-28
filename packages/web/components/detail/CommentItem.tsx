"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { GitHubComment } from "@issuectl/core";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/paper";
import { LightboxBodyText } from "./LightboxBodyText";
import { editComment, deleteComment } from "@/lib/actions/comments";
import { timeAgo } from "@/lib/format";
import styles from "./CommentItem.module.css";

type Props = {
  comment: GitHubComment;
  currentUser: string | null;
  owner: string;
  repo: string;
  issueNumber: number;
};

function initials(login: string | undefined): string {
  if (!login) return "??";
  return login.slice(0, 2).toLowerCase();
}

const DELETE_CONFIRM_MS = 3000;

export function CommentItem({ comment, currentUser, owner, repo, issueNumber }: Props) {
  const router = useRouter();
  const { showToast } = useToast();

  const [mode, setMode] = useState<"normal" | "editing">("normal");
  const [displayBody, setDisplayBody] = useState(comment.body);
  const [editBody, setEditBody] = useState(comment.body);
  const [saving, setSaving] = useState(false);

  // Sync displayBody when the server data changes (e.g. after router.refresh())
  useEffect(() => {
    setDisplayBody(comment.body);
  }, [comment.body]);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwn = currentUser !== null && comment.user?.login === currentUser;

  // Clean up confirm timer on unmount
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleEdit = () => {
    setEditBody(displayBody);
    setMode("editing");
  };

  const handleCancelEdit = () => {
    setMode("normal");
  };

  const handleSaveEdit = async () => {
    if (saving || !editBody.trim()) return;
    setSaving(true);
    const originalBody = displayBody;

    // Optimistic: show new body immediately; rolled back in the error handler below
    setDisplayBody(editBody);
    setMode("normal");

    try {
      const result = await editComment(owner, repo, issueNumber, comment.id, editBody);
      if (!result.success) {
        setDisplayBody(originalBody);
        setMode("editing");
        showToast(result.error, "error");
        return;
      }
      router.refresh();
      showToast(
        result.cacheStale ? "Comment updated — reload if the page looks stale" : "Comment updated",
        "success",
      );
    } catch (err) {
      console.error("[issuectl] Edit comment failed unexpectedly:", err);
      setDisplayBody(originalBody);
      setMode("editing");
      showToast("Failed to edit comment", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSaveEdit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  const handleDeleteClick = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmingDelete(false);
      }, DELETE_CONFIRM_MS);
      return;
    }

    // Confirmed — delete
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmingDelete(false);
    setDeleted(true);

    void (async () => {
      try {
        const result = await deleteComment(owner, repo, issueNumber, comment.id);
        if (!result.success) {
          setDeleted(false);
          showToast(result.error, "error");
          return;
        }
        router.refresh();
        showToast(
          result.cacheStale ? "Comment deleted — reload if the page looks stale" : "Comment deleted",
          "success",
        );
      } catch (err) {
        console.error("[issuectl] Delete comment failed unexpectedly:", err);
        setDeleted(false);
        showToast("Failed to delete comment", "error");
      }
    })();
  };

  if (deleted) return null;

  return (
    <div className={styles.comment}>
      <div className={styles.head}>
        <div className={styles.avi}>
          {comment.user?.avatarUrl ? (
            <Image src={comment.user.avatarUrl} alt="" width={26} height={26} data-avatar="true" />
          ) : (
            initials(comment.user?.login)
          )}
        </div>
        <div className={styles.who}>{comment.user?.login ?? "unknown"}</div>
        {isOwn && mode === "normal" && (
          <div className={styles.actions}>
            <button type="button" className={styles.actionBtn} onClick={handleEdit}>
              edit
            </button>
            <button
              type="button"
              className={`${styles.actionBtn} ${confirmingDelete ? styles.deleteConfirm : ""}`}
              onClick={handleDeleteClick}
              aria-label={confirmingDelete ? "Confirm delete" : "Delete comment"}
            >
              {confirmingDelete ? "confirm?" : "delete"}
            </button>
          </div>
        )}
        <div className={styles.time}>{timeAgo(comment.updatedAt)}</div>
      </div>

      {mode === "editing" ? (
        <>
          <textarea
            className={styles.editTextarea}
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            onKeyDown={handleEditKeyDown}
            rows={4}
            disabled={saving}
            maxLength={65536}
            autoFocus
          />
          <div className={styles.editFooter}>
            <span className={styles.editHint}>⌘↩ to save · esc to cancel</span>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={handleCancelEdit}
              disabled={saving}
            >
              cancel
            </button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveEdit}
              disabled={saving || !editBody.trim()}
            >
              {saving ? "saving…" : "save"}
            </Button>
          </div>
        </>
      ) : (
        <LightboxBodyText body={displayBody} className={styles.commentBody} />
      )}
    </div>
  );
}
