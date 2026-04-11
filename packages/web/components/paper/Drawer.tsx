"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import styles from "./Drawer.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
};

export function Drawer({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className={styles.scrim} onClick={onClose} role="presentation" />
      <aside className={styles.drawer} role="dialog" aria-modal="true">
        <div className={styles.head}>
          <div className={styles.title}>{title}</div>
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
