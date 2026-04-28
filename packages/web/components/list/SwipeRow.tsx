"use client";

import { useRef, useState, useCallback, type ReactNode } from "react";
import styles from "./SwipeRow.module.css";

const SWIPE_THRESHOLD = 100;

/** Horizontal distance must exceed vertical distance by this ratio to count. */
const DIRECTION_RATIO = 1.5;

type SwipeState = "idle" | "left" | "right";

type Props = {
  children: ReactNode;
  onLaunch?: () => void;
  onClose?: () => void;
  disabled?: boolean;
};

export function SwipeRow({ children, onLaunch, onClose, disabled }: Props) {
  const [swiped, setSwiped] = useState<SwipeState>("idle");
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    },
    [disabled],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (startX.current === null || startY.current === null) return;
      const touch = e.changedTouches[0];
      if (!touch) {
        startX.current = null;
        startY.current = null;
        return;
      }
      const deltaX = touch.clientX - startX.current;
      const deltaY = touch.clientY - startY.current;
      const absDX = Math.abs(deltaX);
      const absDY = Math.abs(deltaY);

      // Only recognise the gesture as a horizontal swipe when the horizontal
      // distance clearly dominates the vertical distance. This prevents
      // accidental swipe actions during normal vertical scrolling.
      const isHorizontalSwipe =
        absDX >= SWIPE_THRESHOLD && absDX > absDY * DIRECTION_RATIO;

      if (isHorizontalSwipe && deltaX > 0 && onClose) {
        // Swiped right — reveal close on left
        setSwiped("right");
      } else if (isHorizontalSwipe && deltaX < 0 && onLaunch) {
        // Swiped left — reveal launch on right
        setSwiped("left");
      } else if (isHorizontalSwipe) {
        // Swipe in a direction with no handler — dismiss
        setSwiped("idle");
      }
      startX.current = null;
      startY.current = null;
    },
    [onLaunch, onClose],
  );

  const handleTouchCancel = useCallback(() => {
    startX.current = null;
    startY.current = null;
  }, []);

  const dismiss = useCallback(() => setSwiped("idle"), []);

  const handleContentClick = useCallback(
    (e: React.MouseEvent) => {
      if (swiped === "idle") return;
      e.preventDefault();
      e.stopPropagation();
      dismiss();
    },
    [swiped, dismiss],
  );

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <div
      className={styles.wrapper}
      data-swiped={swiped}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {onClose && (
        <div className={styles.actionsLeft}>
          <button
            className={`${styles.actionBtn} ${styles.closeBtn}`}
            onClick={() => {
              dismiss();
              onClose();
            }}
          >
            Close
          </button>
        </div>
      )}
      {onLaunch && (
        <div className={styles.actionsRight}>
          <button
            className={`${styles.actionBtn} ${styles.launchBtn}`}
            onClick={() => {
              dismiss();
              onLaunch();
            }}
          >
            Launch
          </button>
        </div>
      )}
      <div className={styles.content} onClick={handleContentClick}>
        {children}
      </div>
    </div>
  );
}
