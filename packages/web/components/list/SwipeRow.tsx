"use client";

import { useState, useRef } from "react";
import styles from "./SwipeRow.module.css";

const SWIPE_THRESHOLD = 80;

type Props = {
  onAssign: () => void;
  children: React.ReactNode;
};

export function SwipeRow({ onAssign, children }: Props) {
  const [offset, setOffset] = useState(0);
  const [swiped, setSwiped] = useState(false);
  const startXRef = useRef(0);
  const currentOffsetRef = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    currentOffsetRef.current = swiped ? -SWIPE_THRESHOLD : 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startXRef.current;
    const raw = currentOffsetRef.current + dx;
    // Only allow swiping left (negative offset), clamp at -160px.
    const clamped = Math.max(-160, Math.min(0, raw));
    setOffset(clamped);
  };

  const handleTouchEnd = () => {
    if (offset < -SWIPE_THRESHOLD) {
      // Snap to revealed state.
      setOffset(-SWIPE_THRESHOLD);
      setSwiped(true);
    } else {
      // Snap back.
      setOffset(0);
      setSwiped(false);
    }
  };

  const handleAssign = () => {
    setOffset(0);
    setSwiped(false);
    onAssign();
  };

  const handleOverlayClick = () => {
    setOffset(0);
    setSwiped(false);
  };

  return (
    <div className={styles.wrapper}>
      {/* Assign action panel revealed behind the row */}
      <div className={styles.actionPanel}>
        <button className={styles.assignAction} onClick={handleAssign}>
          assign →
        </button>
      </div>

      {/* Row content, slides left to reveal action */}
      <div
        className={styles.row}
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>

      {/* Invisible overlay to dismiss on tap outside when swiped */}
      {swiped && (
        <div className={styles.overlay} onClick={handleOverlayClick} />
      )}
    </div>
  );
}
