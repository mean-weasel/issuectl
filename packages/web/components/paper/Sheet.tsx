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

// Rubber-band + snap-back animation tuning.
// Higher RUBBER_BAND_C = looser feel; lower = stiffer.
const RUBBER_BAND_C = 200;
const SNAP_BACK_MS = 350;
const SNAP_SPRING = `transform ${SNAP_BACK_MS / 1000}s cubic-bezier(0.34, 1.56, 0.64, 1)`;
const SNAP_SCRIM = `opacity ${SNAP_BACK_MS / 1000}s ease-out`;

const EXIT_DURATION_MS = 220;

export function Sheet({ open, onClose, title, description, children }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const isDesktopRef = useRef(false);
  const isSnappingRef = useRef(false);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  function clearSnapTimer() {
    if (snapTimerRef.current !== undefined) {
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = undefined;
    }
    isSnappingRef.current = false;
  }

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
  // scrollTop. When a nested scrollable element exists (e.g. a filter
  // list inside the sheet body), it is scrolled first; any unconsumed
  // delta propagates up to the sheet. When the sheet is at
  // scrollTop === 0 and the user drags down, we transition into
  // "dismiss mode" — the sheet slides down following the finger (with
  // rubber-band resistance) and dismisses on release if the threshold
  // is met. If the drag falls short, the sheet spring-animates back.
  useEffect(() => {
    const el = dialogRef.current;
    if (!visible || !el) return;

    let startTime = 0;
    let lastY = 0;
    let mode: "idle" | "scroll" | "dismiss" = "idle";
    let accumulatedDragY = 0;
    let scrollTarget: HTMLElement = el;

    /** Find the innermost scrollable ancestor of `start` up to `root`. */
    function findScrollTarget(start: EventTarget | null): HTMLElement {
      let node = start as HTMLElement | null;
      while (node && node !== el) {
        const style = getComputedStyle(node);
        if (
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          node.scrollHeight > node.clientHeight
        ) {
          return node;
        }
        node = node.parentElement;
      }
      return el!;
    }

    /** Drive a container's scrollTop by `delta` px; return unconsumed remainder. */
    function driveScroll(target: HTMLElement, delta: number): number {
      const { scrollTop, scrollHeight, clientHeight } = target;
      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll <= 0) return delta;
      const newTop = Math.max(0, Math.min(maxScroll, scrollTop - delta));
      const consumed = scrollTop - newTop;
      target.scrollTop = newTop;
      return delta - consumed;
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      clearSnapTimer();
      startTime = Date.now();
      lastY = e.touches[0].clientY;
      mode = "idle";
      accumulatedDragY = 0;
      scrollTarget = findScrollTarget(e.target);
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
        if (moveDelta > 0 && scrollTarget.scrollTop <= 0 && el.scrollTop <= 0) {
          // All scroll containers at top, dragging down → dismiss mode.
          mode = "dismiss";
        } else {
          mode = "scroll";
        }
      }

      if (mode === "dismiss") {
        accumulatedDragY = Math.max(0, accumulatedDragY + moveDelta);
        const visual =
          (accumulatedDragY * RUBBER_BAND_C) /
          (accumulatedDragY + RUBBER_BAND_C);
        setDragY(visual);
      } else {
        // Scroll mode — drive the nested target first, then the sheet.
        let remaining = moveDelta;
        if (scrollTarget !== el) {
          remaining = driveScroll(scrollTarget, remaining);
        }
        if (remaining !== 0) {
          remaining = driveScroll(el, remaining);
        }
        // If all scroll is exhausted and the user is dragging down,
        // switch to dismiss mode mid-gesture.
        if (remaining > 0 && el.scrollTop <= 0) {
          mode = "dismiss";
          accumulatedDragY = 0;
        }
      }
    };

    const handleTouchEnd = () => {
      try {
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
            isSnappingRef.current = true;
            setDragY(0);
            snapTimerRef.current = setTimeout(() => {
              isSnappingRef.current = false;
              snapTimerRef.current = undefined;
            }, SNAP_BACK_MS);
          }
        }
      } finally {
        mode = "idle";
        accumulatedDragY = 0;
      }
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
      clearSnapTimer();
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

  // Reset drag and snap state when the sheet closes so stale values don't
  // leak into the next open.
  useEffect(() => {
    if (!open) {
      setDragY(0);
      clearSnapTimer();
    }
  }, [open]);

  if (!visible) return null;

  // On desktop the sheet is centered with translate(-50%), so drag/snap
  // styles must preserve that X offset. On mobile the sheet is edge-aligned
  // so only translateY matters.
  //
  // Three visual states:
  //   1. dragY > 0               → following finger, no transition
  //   2. isSnappingRef.current   → spring-animating back to rest
  //   3. neither                 → at rest, no inline style
  //
  // Note: state 2 works because setDragY(0) triggers the re-render that
  // reads isSnappingRef.current — the ref must be set before setDragY.
  const sheetStyle: CSSProperties | undefined =
    dragY > 0
      ? {
          transform: isDesktopRef.current
            ? `translate(-50%, ${dragY}px)`
            : `translate3d(0, ${dragY}px, 0)`,
          transition: "none",
        }
      : isSnappingRef.current
        ? {
            transform: isDesktopRef.current
              ? "translate(-50%, 0)"
              : "translate3d(0, 0, 0)",
            transition: SNAP_SPRING,
          }
        : undefined;
  const scrimStyle: CSSProperties | undefined =
    dragY > 0
      ? { opacity: Math.max(0.1, 1 - dragY / 400), transition: "none" }
      : isSnappingRef.current
        ? { opacity: 1, transition: SNAP_SCRIM }
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
