"use client";

import { useTheme, type Theme } from "./ThemeProvider";
import styles from "./ThemeToggle.module.css";

const options: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className={styles.toggle}>
      {options.map((opt) => (
        <button
          key={opt.value}
          className={theme === opt.value ? styles.active : styles.option}
          onClick={() => setTheme(opt.value)}
          aria-pressed={theme === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
