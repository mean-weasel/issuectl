"use client";

import styles from "./BottomHandle.module.css";

type Props = {
  onTrigger: () => void;
  label?: string;
};

export function BottomHandle({ onTrigger, label = "Filters" }: Props) {
  return (
    <button
      type="button"
      className={styles.handle}
      onClick={onTrigger}
      aria-label={`Open ${label}`}
    >
      <span className={styles.pill} />
    </button>
  );
}
