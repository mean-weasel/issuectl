"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./LaunchProgressPoller.module.css";

const POLL_INTERVAL_MS = 5000;
const STALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

type Props = {
  active: boolean;
  /** Opaque fingerprint of the current deployment state (e.g. state + ttydPort).
   *  When this changes, the stall timer resets. */
  stateFingerprint?: string;
};

// Drives a parent Server Component re-fetch via router.refresh() while the
// deployment is active — the RSC equivalent of a polling fetch. Pauses on
// visibilitychange so a backgrounded tab doesn't keep firing GitHub-backed
// refreshes (battery, API quota). Browsers throttle hidden-tab timers, but
// not aggressively enough to skip this.
//
// Improvements over the original:
// - Concurrency guard: overlapping router.refresh() calls cannot pile up
// - Stall detection: warns the user if no state change in 5 minutes
export function LaunchProgressPoller({ active, stateFingerprint }: Props) {
  const router = useRouter();
  const isRefreshing = useRef(false);
  const [stalled, setStalled] = useState(false);

  // Reset stall timer whenever the server-rendered state changes
  const lastFingerprint = useRef(stateFingerprint);
  useEffect(() => {
    if (stateFingerprint !== lastFingerprint.current) {
      lastFingerprint.current = stateFingerprint;
      setStalled(false);
    }
  }, [stateFingerprint]);

  const safeRefresh = useCallback(() => {
    if (isRefreshing.current) return;
    isRefreshing.current = true;
    // router.refresh() returns void but behaves as an async operation
    // internally. Use startTransition-style scheduling: mark done on the
    // next microtask so the flag clears after React processes the update.
    router.refresh();
    // Clear the guard after a short delay — router.refresh() doesn't
    // return a promise, so we use a conservative timeout that's shorter
    // than the poll interval to avoid skipping cycles.
    setTimeout(() => {
      isRefreshing.current = false;
    }, 2000);
  }, [router]);

  useEffect(() => {
    if (!active) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(safeRefresh, POLL_INTERVAL_MS);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [active, safeRefresh]);

  // Stall detection: if active and no fingerprint change for STALL_TIMEOUT_MS
  useEffect(() => {
    if (!active || stalled) return;

    const stallTimer = setTimeout(() => {
      setStalled(true);
    }, STALL_TIMEOUT_MS);

    return () => clearTimeout(stallTimer);
  }, [active, stalled, stateFingerprint]);

  if (!stalled) return null;

  return (
    <div className={styles.stallWarning} role="alert">
      <span className={styles.stallIcon}>!</span>
      <span>
        Launch may be stalled — no progress detected for 5 minutes.
        Try refreshing the page or check the terminal logs.
      </span>
    </div>
  );
}
