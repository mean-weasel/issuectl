"use client";

import { MAX_PREAMBLE } from "@/lib/constants";
import styles from "./PreambleInput.module.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function PreambleInput({ value, onChange }: Props) {
  const remaining = MAX_PREAMBLE - value.length;
  const nearLimit = remaining < 500;

  return (
    <div className={styles.field}>
      <label className={styles.label}>
        Custom preamble <span className={styles.optional}>(optional)</span>
      </label>
      <textarea
        className={styles.textarea}
        placeholder="Additional instructions for Claude Code..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MAX_PREAMBLE}
      />
      {nearLimit && (
        <div className={styles.counter} aria-live="polite">
          {remaining} characters remaining
        </div>
      )}
    </div>
  );
}
