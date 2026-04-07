"use client";

import styles from "./FilterChips.module.css";

type Props = {
  options: string[];
  active: string;
  onChange: (value: string) => void;
};

export function FilterChips({ options, active, onChange }: Props) {
  return (
    <div className={styles.chips}>
      {options.map((opt) => (
        <button
          key={opt}
          className={opt === active ? styles.active : styles.chip}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
