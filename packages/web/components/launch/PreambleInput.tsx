"use client";

import styles from "./PreambleInput.module.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function PreambleInput({ value, onChange }: Props) {
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
      />
    </div>
  );
}
