"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import styles from "./Sheet.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
};

// Tabbable elements inside a dialog container. Excludes disabled and
// explicit -1 tabindex. Keeps focus cycling predictable for the trap.
function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function Sheet({ open, onClose, title, description, children }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus management: on open, move focus into the dialog and capture the
  // previously-focused element so we can restore it on close. This effect
  // is intentionally scoped to `[open]` — rerunning it on `onClose` identity
  // change would re-capture mid-session and land focus back inside the
  // dialog instead of on the trigger that opened it.
  useEffect(() => {
    if (!open) return;
    const toRestore = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog) {
      const focusables = getFocusable(dialog);
      (focusables[0] ?? dialog).focus();
    }
    return () => {
      toRestore?.focus();
    };
  }, [open]);

  // Body scroll lock while the sheet is open. Prevents the page behind the
  // scrim from scrolling when the user drags on the scrim or tries to swipe
  // the sheet — a real mobile Safari confusion source otherwise.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Keyboard handling: Escape closes, Tab/Shift+Tab cycle within the dialog.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = getFocusable(dialog);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className={styles.scrim}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.grab} />
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </>
  );
}
