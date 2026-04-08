"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { updateSetting } from "@/lib/actions/settings";
import styles from "./TerminalSettings.module.css";

type Props = {
  terminalApp: string;
  windowTitle: string;
  tabTitlePattern: string;
};

export function TerminalSettings({ terminalApp, windowTitle, tabTitlePattern }: Props) {
  const [winTitle, setWinTitle] = useState(windowTitle);
  const [tabPattern, setTabPattern] = useState(tabTitlePattern);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function showSaved() {
    setSaved(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSaved(false), 2000);
  }

  function handleBlur(key: "terminal_window_title" | "terminal_tab_title_pattern", value: string, original: string) {
    if (value === original) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateSetting(key, value);
      if (result.success) {
        showSaved();
      } else {
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
          <div className={styles.label}>Window Title</div>
          <input
            className={styles.inputEditable}
            value={winTitle}
            onChange={(e) => setWinTitle(e.target.value)}
            onBlur={() => handleBlur("terminal_window_title", winTitle, windowTitle)}
            disabled={isPending}
          />
        </div>
      </div>
      <div className={styles.row} style={{ marginTop: 12 }}>
        <div className={styles.field}>
          <div className={styles.label}>Tab Title Pattern</div>
          <input
            className={styles.inputEditable}
            value={tabPattern}
            onChange={(e) => setTabPattern(e.target.value)}
            onBlur={() => handleBlur("terminal_tab_title_pattern", tabPattern, tabTitlePattern)}
            disabled={isPending}
          />
          <div className={styles.help}>
            Placeholders: {"{number}"}, {"{title}"}, {"{repo}"}, {"{owner}"}
          </div>
        </div>
      </div>
      {saved && <div className={styles.saved}>Saved</div>}
      {error && <div className={styles.error} role="alert">{error}</div>}
    </>
  );
}
