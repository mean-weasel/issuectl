"use client";

import { useState, useTransition } from "react";
import { addComment } from "@/lib/actions/comments";
import { Button } from "@/components/paper";
import { useToast } from "@/components/ui/ToastProvider";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import styles from "./CommentForm.module.css";

type Props = {
  owner: string;
  repo: string;
  issueNumber: number;
};

export function CommentForm({ owner, repo, issueNumber }: Props) {
  const { showToast } = useToast();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!body.trim()) return;
    const text = body;
    const idempotencyKey = newIdempotencyKey();
    setBody("");
    setError(null);
    startTransition(async () => {
      const result = await addComment(owner, repo, issueNumber, text, idempotencyKey);
      if (!result.success) {
        setBody(text);
        setError(result.error ?? "Failed to post comment. Please try again.");
      } else {
        showToast("Comment posted", "success");
      }
    });
  }

  return (
    <div className={styles.form}>
      <textarea
        className={styles.textarea}
        placeholder="Add a comment..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        disabled={isPending}
        maxLength={65536}
      />
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      <div className={styles.actions}>
        {isPending && <span className={styles.posting}>Posting...</span>}
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={isPending || !body.trim()}
        >
          Comment
        </Button>
      </div>
    </div>
  );
}
