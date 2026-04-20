"use client";

import { useEffect } from "react";

/**
 * Ref-counted body scroll lock.
 *
 * Multiple Sheet/Drawer instances can request a lock simultaneously.
 * The body overflow is only restored when every lock has been released,
 * avoiding the stale-restore bug where a closing modal restores
 * "hidden" because it captured that value from an overlapping modal.
 */
let lockCount = 0;

function lock() {
  lockCount++;
  if (lockCount === 1) {
    document.body.style.overflow = "hidden";
  }
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1);
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
