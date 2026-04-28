"use client";

import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import styles from "./Modal.module.css";

type Props = {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  onClose: () => void;
  disabled?: boolean;
};

/**
 * Return all focusable elements inside a container.
 */
function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function Modal({
  title,
  children,
  footer,
  width,
  onClose,
  disabled,
}: Props) {
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const modalStyle =
    width !== undefined
      ? ({ "--modal-width": `${width}px` } as CSSProperties)
      : undefined;
  // Stable ref avoids re-registering the keydown listener when onClose identity changes
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus the modal container so keyboard events work immediately
    modalRef.current?.focus();

    // Lock body scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      // Escape to close
      if (e.key === "Escape" && !disabled) {
        e.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }

      // Focus trap
      if (e.key === "Tab" && modalRef.current) {
        const focusable = getFocusable(modalRef.current);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
      // Restore focus to the element that opened the modal
      previouslyFocused?.focus();
    };
  }, [disabled]);

  return (
    <div
      className={styles.overlay}
      onClick={disabled ? undefined : onClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className={styles.modal}
        style={modalStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span id={titleId} className={styles.title}>
            {title}
          </span>
          <button
            className={styles.close}
            onClick={disabled ? undefined : onClose}
            disabled={disabled}
            aria-label="Close"
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
