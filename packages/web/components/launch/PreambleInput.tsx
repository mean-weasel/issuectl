"use client";

import { MAX_PREAMBLE } from "@/lib/constants";
import { launchAgentLabel, type LaunchAgent } from "./agent";
import styles from "./PreambleInput.module.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  agent: LaunchAgent;
};

export function PreambleInput({ value, onChange, agent }: Props) {
  const remaining = MAX_PREAMBLE - value.length;
  const nearLimit = remaining < 500;

  return (
    <div className={styles.field}>
      <label className={styles.label}>
        Custom preamble <span className={styles.optional}>(optional)</span>
      </label>
      <textarea
        className={styles.textarea}
        placeholder={`Additional instructions for ${launchAgentLabel(agent)}...`}
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
