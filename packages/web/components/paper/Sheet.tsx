"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import styles from "./Sheet.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
};

export function Sheet({ open, onClose, title, description, children }: Props) {
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
      <div
        className={styles.scrim}
        onClick={onClose}
        role="presentation"
      />
      <div className={styles.sheet} role="dialog" aria-modal="true">
        <div className={styles.grab} />
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </>
  );
}
