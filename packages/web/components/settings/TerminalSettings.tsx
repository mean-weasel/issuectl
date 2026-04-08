"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { updateSetting } from "@/lib/actions/settings";
import styles from "./TerminalSettings.module.css";

type Props = {
  terminalApp: string;
  terminalMode: string;
};

export function TerminalSettings({ terminalApp, terminalMode }: Props) {
  const [mode, setMode] = useState(terminalMode);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleModeChange(newMode: string) {
    if (newMode === mode) return;
    setMode(newMode);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateSetting("terminal_window_title", newMode);
      if (result.success) {
        setSaved(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setSaved(false), 2000);
      } else {
        setMode(mode);
        setError(result.error ?? "Failed to save");
      }
    });
  }

  return (
    <>
      <div className={styles.row}>
        <div className={styles.field}>
          <div className={styles.label}>Application</div>
          <input
            className={styles.input}
            value={terminalApp}
            readOnly
          />
        </div>
        <div className={styles.field}>
          <div className={styles.label}>Mode</div>
          <div className={styles.toggle}>
            <button
              type="button"
              className={mode === "window" ? styles.toggleBtnActive : styles.toggleBtn}
              onClick={() => handleModeChange("window")}
              disabled={isPending}
            >
              Window
            </button>
            <button
              type="button"
              className={mode === "tab" ? styles.toggleBtnActive : styles.toggleBtn}
              onClick={() => handleModeChange("tab")}
              disabled={isPending}
            >
              Tab
            </button>
          </div>
        </div>
      </div>
      {saved && <div className={styles.saved}>Saved</div>}
      {error && <div className={styles.error} role="alert">{error}</div>}
    </>
  );
}
