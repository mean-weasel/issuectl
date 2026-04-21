"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { useScrollLock } from "@/hooks/useScrollLock";
import styles from "./Sheet.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
};

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

// Dismiss thresholds, matching iOS-native bottom-sheet feel:
//   - A slow drag past DISMISS_DRAG_PX dismisses.
//   - A fast flick (velocity > FLICK_VELOCITY_PX_PER_MS) dismisses after
//     only FLICK_MIN_DRAG_PX — so a quick swipe closes without needing the
//     full slow-drag distance.
const DISMISS_DRAG_PX = 100;
const FLICK_VELOCITY_PX_PER_MS = 0.5;
const FLICK_MIN_DRAG_PX = 40;

const EXIT_DURATION_MS = 220;

export function Sheet({ open, onClose, title, description, children }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const isDesktopRef = useRef(false);

  // Stable ref for onClose so native handlers always see the latest callback.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Stay mounted during exit animation so the slide-down is visible.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (open) {
      setVisible(true);
    }
  }, [open]);

  const closing = !open && visible;

  useEffect(() => {
    if (!closing) return;
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const duration = prefersReduced ? 0 : EXIT_DURATION_MS;
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [closing]);

  // Track viewport size across the sheet's open lifetime so a
  // portrait→landscape rotation mid-drag doesn't compose the wrong transform.
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const update = () => {
      isDesktopRef.current = mql.matches;
    };
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

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

  // Lock body scroll for the full mounted lifetime (including exit animation).
  useScrollLock(visible);

  // Unified native touch handler: scroll + swipe-to-dismiss.
  //
  // All touchmove events are preventDefault'd so iOS Safari can never
  // chain overscroll to the page. Scrolling is driven manually via
  // el.scrollTop. When the sheet is at scrollTop === 0 and the user
  // drags down, we transition into "dismiss mode" — the sheet slides
  // down following the finger and dismisses on release if the threshold
  // is met.
  useEffect(() => {
    const el = dialogRef.current;
    if (!visible || !el) return;

    let startTime = 0;
    let lastY = 0;
    let mode: "idle" | "scroll" | "dismiss" = "idle";
    let accumulatedDragY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      startTime = Date.now();
      lastY = e.touches[0].clientY;
      mode = "idle";
      accumulatedDragY = 0;
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.touches.length === 0) return;

      const touchY = e.touches[0].clientY;
      const moveDelta = touchY - lastY;
      lastY = touchY;

      if (mode === "idle") {
        // First movement decides the mode.
        if (moveDelta > 0 && el.scrollTop <= 0) {
          // At top, dragging down → dismiss mode.
          mode = "dismiss";
        } else {
          mode = "scroll";
        }
      }

      if (mode === "dismiss") {
        accumulatedDragY = Math.max(0, accumulatedDragY + moveDelta);
        setDragY(accumulatedDragY);
      } else {
        // Scroll mode — drive scrollTop manually.
        const { scrollTop, scrollHeight, clientHeight } = el;
        const maxScroll = scrollHeight - clientHeight;
        if (maxScroll > 0) {
          el.scrollTop = Math.max(0, Math.min(maxScroll, scrollTop - moveDelta));
        }
        // If we scrolled to the top and the user is now dragging down,
        // switch to dismiss mode mid-gesture.
        if (el.scrollTop <= 0 && moveDelta > 0) {
          mode = "dismiss";
          accumulatedDragY = 0;
        }
      }
    };

    const handleTouchEnd = () => {
      if (mode === "dismiss" && accumulatedDragY > 0) {
        const elapsed = Math.max(1, Date.now() - startTime);
        const velocity = accumulatedDragY / elapsed;
        const shouldDismiss =
          accumulatedDragY > DISMISS_DRAG_PX ||
          (accumulatedDragY > FLICK_MIN_DRAG_PX &&
            velocity > FLICK_VELOCITY_PX_PER_MS);
        if (shouldDismiss) {
          onCloseRef.current();
        } else {
          setDragY(0);
        }
      }
      mode = "idle";
      accumulatedDragY = 0;
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    el.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [visible]);

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

  // Reset drag state when the sheet closes so a stale dragY doesn't leak
  // into the next open.
  useEffect(() => {
    if (!open) {
      setDragY(0);
    }
  }, [open]);

  if (!visible) return null;

  // Preserve the existing desktop centered transform by composing the two.
  // On mobile the sheet is edge-aligned so only translateY matters.
  const sheetTransform =
    dragY > 0
      ? isDesktopRef.current
        ? `translate(-50%, ${dragY}px)`
        : `translate3d(0, ${dragY}px, 0)`
      : undefined;
  const sheetStyle: CSSProperties | undefined = sheetTransform
    ? { transform: sheetTransform, transition: "none" }
    : undefined;
  const scrimStyle: CSSProperties | undefined =
    dragY > 0
      ? { opacity: Math.max(0.1, 1 - dragY / 400), transition: "none" }
      : undefined;

  return (
    <>
      <div
        className={styles.scrim}
        data-closing={closing || undefined}
        onClick={onClose}
        aria-hidden="true"
        style={scrimStyle}
      />
      <div
        ref={dialogRef}
        className={styles.sheet}
        data-closing={closing || undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={sheetStyle}
      >
        <div className={styles.grabArea} aria-hidden="true">
          <div className={styles.grab} />
        </div>
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
