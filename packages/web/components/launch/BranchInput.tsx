"use client";

import { useState } from "react";
import { VALID_BRANCH_RE } from "@/lib/constants";
import styles from "./BranchInput.module.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function BranchInput({ value, onChange }: Props) {
  const [touched, setTouched] = useState(false);
  const trimmed = value.trim();
  const isValid = trimmed.length === 0 || VALID_BRANCH_RE.test(trimmed);
  const showError = touched && trimmed.length > 0 && !isValid;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor="launch-branch">Branch</label>
      <input
        id="launch-branch"
        className={`${styles.input} ${showError ? styles.inputError : ""}`}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        spellCheck={false}
      />
      {showError ? (
        <div className={styles.error}>
          Must start with a letter or number. Only letters, numbers, dots, underscores, hyphens, and slashes allowed.
        </div>
      ) : (
        <div className={styles.hint}>
          Existing branch will be checked out; otherwise a new branch is created
        </div>
      )}
    </div>
  );
}
