"use client";

import { useState } from "react";
import type { Priority } from "@issuectl/core";
import { Sheet } from "@/components/paper";
import { setPriorityAction } from "@/lib/actions/priority";
import styles from "./PriorityPicker.module.css";

type PriorityOption = {
  value: Priority;
  symbol: string;
  label: string;
  description: string;
};

const OPTIONS: PriorityOption[] = [
  {
    value: "high",
    symbol: "↑",
    label: "high",
    description: "needs attention soon",
  },
  {
    value: "normal",
    symbol: "–",
    label: "normal",
    description: "standard priority",
  },
  { value: "low", symbol: "↓", label: "low", description: "can wait" },
];

type Props = {
  repoId: number;
  issueNumber: number;
  currentPriority: Priority;
};

export function PriorityPicker({ repoId, issueNumber, currentPriority }: Props) {
  const [open, setOpen] = useState(false);
  const [priority, setPriority] = useState<Priority>(currentPriority);
  const [setting, setSetting] = useState<Priority | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (next: Priority) => {
    setSetting(next);
    setError(null);
    try {
      await setPriorityAction(repoId, issueNumber, next);
      setPriority(next);
      setOpen(false);
    } catch {
      setError("Failed to update priority");
    } finally {
      setSetting(null);
    }
  };

  return (
    <>
      <button className={styles.trigger} onClick={() => setOpen(true)}>
        priority: {priority}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="set priority">
        <div className={styles.body}>
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`${styles.row} ${priority === opt.value ? styles.active : ""}`}
              onClick={() => handleSelect(opt.value)}
              disabled={setting !== null}
            >
              <span className={`${styles.symbol} ${styles[opt.value]}`}>
                {opt.symbol}
              </span>
              <div className={styles.text}>
                <div className={styles.label}>{opt.label}</div>
                <div className={styles.description}>{opt.description}</div>
              </div>
              {priority === opt.value && (
                <span className={styles.current}>current</span>
              )}
              {setting === opt.value && (
                <span className={styles.spinner}>saving…</span>
              )}
            </button>
          ))}
          {error && <div className={styles.error}>{error}</div>}
        </div>
      </Sheet>
    </>
  );
}
