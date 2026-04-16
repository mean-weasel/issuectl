"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import styles from "./Drawer.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
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

export function Drawer({ open, onClose, title, children }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);

  // Focus management: capture → focus first → restore on close.
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

  // Body scroll lock while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape + Tab trap.
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
      <aside
        ref={dialogRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.head}>
          <div id={titleId} className={styles.title}>
            {title}
          </div>
          <button
            className={styles.close}
            onClick={onClose}
            aria-label="Close navigation"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </aside>
    </>
  );
}
