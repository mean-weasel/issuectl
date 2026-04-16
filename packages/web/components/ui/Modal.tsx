"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import styles from "./Modal.module.css";

type Props = {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  onClose: () => void;
  disabled?: boolean;
};

export function Modal({
  title,
  children,
  footer,
  width,
  onClose,
  disabled,
}: Props) {
  const modalStyle =
    width !== undefined
      ? ({ "--modal-width": `${width}px` } as CSSProperties)
      : undefined;
  // Stable ref avoids re-registering the keydown listener when onClose identity changes
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (disabled) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onCloseRef.current();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [disabled]);

  return (
    <div
      className={styles.overlay}
      onClick={disabled ? undefined : onClose}
    >
      <div
        className={styles.modal}
        style={modalStyle}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <button
            className={styles.close}
            onClick={disabled ? undefined : onClose}
            disabled={disabled}
          >
            &times;
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
