"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import styles from "./CloseIssueModal.module.css";

type Props = {
  issueNumber: number;
  onConfirm: (comment: string) => void;
  onCancel: () => void;
  isPending?: boolean;
  error?: string;
};

export function CloseIssueModal({
  issueNumber,
  onConfirm,
  onCancel,
  isPending,
  error,
}: Props) {
  const [comment, setComment] = useState("");

  return (
    <Modal
      title="Close Issue"
      width={480}
      onClose={onCancel}
      disabled={isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => onConfirm(comment)}
            disabled={isPending}
            className={styles.danger}
          >
            {isPending ? "Closing\u2026" : "Close Issue"}
          </Button>
        </>
      }
    >
      <div className={styles.body}>
        <p className={styles.message}>
          Close issue #{issueNumber}? This can be reopened later from GitHub.
        </p>
        <textarea
          className={styles.textarea}
          placeholder="Add a closing comment\u2026"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={isPending}
          maxLength={65536}
          rows={3}
        />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
