"use client";

import { useRef } from "react";
import styles from "./FilterEdgeSwipe.module.css";

type Props = {
  onTrigger: () => void;
  label?: string;
};

const OPEN_THRESHOLD_PX = 40;

export function FilterEdgeSwipe({ onTrigger, label = "Filters" }: Props) {
  const startY = useRef<number | null>(null);
  const firedRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent<HTMLButtonElement>) => {
    if (e.touches.length === 0) return;
    startY.current = e.touches[0].clientY;
    firedRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLButtonElement>) => {
    if (startY.current === null || firedRef.current) return;
    if (e.touches.length === 0) return;
    const delta = startY.current - e.touches[0].clientY;
    if (delta > OPEN_THRESHOLD_PX) {
      firedRef.current = true;
      onTrigger();
    }
  };

  const handleTouchEnd = () => {
    // Reset both refs for symmetry — guards against any state held across
    // a gesture that was interrupted between touchstart and touchend.
    startY.current = null;
    firedRef.current = false;
  };

  return (
    <button
      type="button"
      className={styles.zone}
      onClick={onTrigger}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      aria-label={`Open ${label} — swipe up or tap`}
    />
  );
}
