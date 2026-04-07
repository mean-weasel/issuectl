"use client";

import styles from "./BranchInput.module.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function BranchInput({ value, onChange }: Props) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor="launch-branch">Branch</label>
      <input
        id="launch-branch"
        className={styles.input}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      <div className={styles.hint}>
        Existing branch will be checked out; otherwise a new branch is created
      </div>
    </div>
  );
}
