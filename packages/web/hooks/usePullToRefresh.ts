"use client";

import { useRef, useState, useCallback, useEffect } from "react";

type Options = {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPull?: number;
};

export function usePullToRefresh({
  onRefresh,
  threshold = 60,
  maxPull = 120,
}: Options) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  // Store pullDistance in a ref so handleTouchEnd can read the latest
  // value without being recreated on every pixel of movement.
  const pullDistanceRef = useRef(0);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (refreshing) return;
      const container = containerRef.current;
      if (!container || container.scrollTop > 0) return;
      startY.current = e.touches[0].clientY;
    },
    [refreshing],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (refreshing || startY.current === null) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;
      if (diff > 0) {
        pulling.current = true;
        const distance = Math.min(diff * 0.5, maxPull);
        setPullDistance(distance);
        pullDistanceRef.current = distance;
        if (distance > 10) e.preventDefault();
      } else {
        pulling.current = false;
        setPullDistance(0);
        pullDistanceRef.current = 0;
      }
    },
    [refreshing, maxPull],
  );

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current || refreshing) {
      startY.current = null;
      pulling.current = false;
      return;
    }
    startY.current = null;
    pulling.current = false;
    if (pullDistanceRef.current >= threshold) {
      setRefreshing(true);
      setPullDistance(0);
      pullDistanceRef.current = 0;
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    } else {
      setPullDistance(0);
      pullDistanceRef.current = 0;
    }
  }, [threshold, onRefresh, refreshing]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    container.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    container.addEventListener("touchend", handleTouchEnd);
    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { containerRef, pullDistance, refreshing };
}
