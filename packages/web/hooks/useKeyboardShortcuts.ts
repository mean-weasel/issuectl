"use client";

import { useEffect } from "react";

type ShortcutMap = Record<string, () => void>;

/**
 * Registers global keydown listeners for keyboard shortcuts.
 * Ignores keystrokes when focus is in an input, textarea, select, or
 * contenteditable element — except for Escape, which always fires.
 * Cleans up on unmount.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Escape always fires, regardless of focus
      if (e.key === "Escape") {
        const fn = shortcuts["Escape"];
        if (fn) {
          e.preventDefault();
          fn();
        }
        return;
      }

      // Ignore when typing in form elements
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }

      // Ignore when modifier keys are held (Ctrl/Cmd/Alt)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const fn = shortcuts[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
