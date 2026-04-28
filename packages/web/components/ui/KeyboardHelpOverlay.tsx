"use client";

import styles from "./KeyboardHelpOverlay.module.css";

const LIST_SHORTCUTS = [
  { key: "j / k", desc: "Move focus down / up" },
  { key: "Enter", desc: "Open focused item" },
  { key: "n", desc: "New issue" },
  { key: "d", desc: "Create draft" },
  { key: "i", desc: "Switch to Issues tab" },
  { key: "p", desc: "Switch to PRs tab" },
  { key: "1-4", desc: "Switch section (issues tab)" },
];

const DETAIL_SHORTCUTS = [
  { key: "Esc", desc: "Go back to list" },
  { key: "l", desc: "Launch issue" },
  { key: "m", desc: "Merge PR" },
];

const GLOBAL_SHORTCUTS = [
  { key: "?", desc: "Toggle this help" },
];

/**
 * Keyboard shortcut help overlay. Hidden by default; toggled via the `?` key.
 * Uses a plain DOM id so ListKeyboardNav can toggle display without React state.
 */
export function KeyboardHelpOverlay() {
  return (
    <div
      id="keyboard-help-overlay"
      className={styles.overlay}
      style={{ display: "none" }}
      onClick={(e) => {
        // Close when clicking the backdrop
        if (e.target === e.currentTarget) {
          (e.currentTarget as HTMLElement).style.display = "none";
        }
      }}
    >
      <div className={styles.panel}>
        <h2 className={styles.title}>keyboard shortcuts</h2>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>list view</h3>
          {LIST_SHORTCUTS.map((s) => (
            <div key={s.key} className={styles.row}>
              <kbd className={styles.key}>{s.key}</kbd>
              <span className={styles.desc}>{s.desc}</span>
            </div>
          ))}
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>detail view</h3>
          {DETAIL_SHORTCUTS.map((s) => (
            <div key={s.key} className={styles.row}>
              <kbd className={styles.key}>{s.key}</kbd>
              <span className={styles.desc}>{s.desc}</span>
            </div>
          ))}
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>global</h3>
          {GLOBAL_SHORTCUTS.map((s) => (
            <div key={s.key} className={styles.row}>
              <kbd className={styles.key}>{s.key}</kbd>
              <span className={styles.desc}>{s.desc}</span>
            </div>
          ))}
        </div>

        <p className={styles.hint}>
          press <kbd className={styles.key}>?</kbd> or <kbd className={styles.key}>Esc</kbd> to close
        </p>
      </div>
    </div>
  );
}
