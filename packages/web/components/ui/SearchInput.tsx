"use client";

import styles from "./SearchInput.module.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function SearchInput({ value, onChange, placeholder }: Props) {
  return (
    <div className={styles.wrap}>
      <input
        type="text"
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Filter..."}
      />
    </div>
  );
}
