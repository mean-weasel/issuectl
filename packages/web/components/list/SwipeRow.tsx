"use client";

import { useRef, useState, useCallback, type ReactNode } from "react";
import styles from "./SwipeRow.module.css";

const SWIPE_THRESHOLD = 60;

type Props = {
  children: ReactNode;
  onLaunch?: () => void;
  onReassign?: () => void;
  disabled?: boolean;
};

export function SwipeRow({ children, onLaunch, onReassign, disabled }: Props) {
  const [swiped, setSwiped] = useState(false);
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
      const delta = startX.current - touch.clientX;
      if (delta > SWIPE_THRESHOLD) {
        setSwiped(true);
      } else if (delta < -SWIPE_THRESHOLD) {
        setSwiped(false);
      }
      startX.current = null;
    },
    [],
  );

  const handleTouchCancel = useCallback(() => {
    startX.current = null;
  }, []);

  const close = useCallback(() => setSwiped(false), []);

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
      <div className={styles.actions}>
        {onLaunch && (
          <button
            className={`${styles.actionBtn} ${styles.launchBtn}`}
            onClick={() => {
              close();
              onLaunch();
            }}
          >
            Launch
          </button>
        )}
        {onReassign && (
          <button
            className={`${styles.actionBtn} ${styles.reassignBtn}`}
            onClick={() => {
              close();
              onReassign();
            }}
          >
            Re-assign
          </button>
        )}
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
