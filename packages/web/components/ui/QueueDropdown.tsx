"use client";

import { type QueuedOperation } from "@/lib/offline-queue";
import styles from "./QueueDropdown.module.css";

type Props = {
  operations: QueuedOperation[];
  onCancel: (id: string) => void;
};

function describeOp(op: QueuedOperation): string {
  const p = op.params;
  switch (op.action) {
    case "assignDraft":
      return "Assign draft → repo";
    case "addComment":
      return `Comment on ${p.owner as string}/${p.repo as string}#${p.issueNumber as number}`;
    case "toggleLabel": {
      const verb = (p.action as string) === "add" ? "Add" : "Remove";
      return `${verb} label "${p.label as string}" on ${p.owner as string}/${p.repo as string}#${p.issueNumber as number}`;
    }
    case "closeIssue":
      return `Close ${p.owner as string}/${p.repo as string}#${p.issueNumber as number}`;
    case "setPriority":
      return `Set priority to "${p.priority as string}" on issue #${p.issueNumber as number}`;
    default:
      return op.action;
  }
}

export function QueueDropdown({ operations, onCancel }: Props) {
  if (operations.length === 0) return null;

  return (
    <div className={styles.dropdown} role="list" aria-label="Queued operations">
      <div className={styles.header}>Queued operations</div>
      {operations.map((op) => (
        <div key={op.id} className={styles.row} role="listitem">
          <span className={styles.description}>{describeOp(op)}</span>
          <button
            className={styles.cancel}
            onClick={() => onCancel(op.id)}
            aria-label={`Cancel: ${describeOp(op)}`}
          >
            Cancel
          </button>
        </div>
      ))}
    </div>
  );
}
