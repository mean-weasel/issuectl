"use client";

import { useState } from "react";
import { type QueuedOperation } from "@/lib/offline-queue";
import { Modal } from "./Modal";
import styles from "./FailureModal.module.css";

type Props = {
  failures: QueuedOperation[];
  onRetry: (op: QueuedOperation) => Promise<void>;
  onDiscard: (id: string) => void;
  onClose: () => void;
};

function describeOp(op: QueuedOperation): string {
  const p = op.params;
  switch (op.action) {
    case "assignDraft":
      return "Assign draft to repo";
    case "addComment":
      return `Comment on ${p.owner}/${p.repo}#${p.issueNumber}`;
    case "toggleLabel": {
      const verb = p.action === "add" ? "Add" : "Remove";
      return `${verb} label "${p.label}" on ${p.owner}/${p.repo}#${p.issueNumber}`;
    }
    default:
      return op.action;
  }
}

export function FailureModal({ failures, onRetry, onDiscard, onClose }: Props) {
  const [retrying, setRetrying] = useState<string | null>(null);

  async function handleRetry(op: QueuedOperation) {
    setRetrying(op.id);
    try {
      await onRetry(op);
    } catch (err) {
      console.error("[issuectl] Retry failed for operation:", op.id, err);
    } finally {
      setRetrying(null);
    }
  }

  return (
    <Modal title="Failed to sync" width={440} onClose={onClose}>
      {failures.map((op) => (
        <div key={op.id} className={styles.row}>
          <div className={styles.info}>
            <div className={styles.description}>{describeOp(op)}</div>
            <div className={styles.error}>{op.error}</div>
          </div>
          <div className={styles.actions}>
            <button
              className={styles.retry}
              onClick={() => handleRetry(op)}
              disabled={retrying === op.id}
            >
              {retrying === op.id ? "Retrying\u2026" : "Retry"}
            </button>
            <button
              className={styles.discard}
              onClick={() => onDiscard(op.id)}
              disabled={retrying === op.id}
            >
              Discard
            </button>
          </div>
        </div>
      ))}
    </Modal>
  );
}
