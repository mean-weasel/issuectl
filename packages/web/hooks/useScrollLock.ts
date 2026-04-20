"use client";

import { useEffect } from "react";

/**
 * Ref-counted body scroll lock.
 *
 * Multiple Sheet/Drawer instances can request a lock simultaneously —
 * the most common overlap is a Sheet's exit animation (which keeps
 * `visible` true) coinciding with another modal opening. The body
 * overflow is only restored when every lock has been released, avoiding
 * the stale-restore bug where a closing modal restores the overflow
 * value it captured at open time, prematurely unlocking scroll while
 * another modal is still visible.
 */
let lockCount = 0;

function lock() {
  lockCount++;
  if (lockCount === 1) {
    document.body.style.overflow = "hidden";
  }
}

function unlock() {
  if (lockCount <= 0) {
    console.warn(
      "[useScrollLock] unlock() called when lockCount is already 0. " +
        "This indicates a mismatched lock/unlock — check component lifecycle.",
    );
    return;
  }
  lockCount--;
  if (lockCount === 0) {
    document.body.style.overflow = "";
  }
}

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}
