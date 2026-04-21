"use client";

import { useRef, useState, useCallback, type ReactNode } from "react";
import styles from "./SwipeRow.module.css";

const SWIPE_THRESHOLD = 60;

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

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      startX.current = e.touches[0].clientX;
    },
    [disabled],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (startX.current === null) return;
      const touch = e.changedTouches[0];
      if (!touch) {
        startX.current = null;
        return;
      }
      const delta = touch.clientX - startX.current;
      if (delta > SWIPE_THRESHOLD && onClose) {
        // Swiped right — reveal close on left
        setSwiped("right");
      } else if (delta < -SWIPE_THRESHOLD && onLaunch) {
        // Swiped left — reveal launch on right
        setSwiped("left");
      } else if (Math.abs(delta) > SWIPE_THRESHOLD) {
        // Swipe in a direction with no handler — dismiss
        setSwiped("idle");
      }
      startX.current = null;
    },
    [onLaunch, onClose],
  );

  const handleTouchCancel = useCallback(() => {
    startX.current = null;
  }, []);

  const dismiss = useCallback(() => setSwiped("idle"), []);

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
      <div className={styles.content}>{children}</div>
    </div>
  );
}
