"use client";

import { useEffect } from "react";

/**
 * Ref-counted body scroll lock.
 *
 * Multiple Sheet/Drawer instances can request a lock simultaneously.
 * The body overflow is only restored when every lock has been released.
 *
 * iOS Safari requires an aggressive multi-layer approach:
 *   1. `position: fixed` on html + body (prevents viewport scroll)
 *   2. `overflow: hidden` on html + body
 *   3. Blanket touchmove prevention on the document (prevents ALL
 *      touch-driven scrolling — the Sheet component handles its own
 *      scrolling manually via el.scrollTop)
 */
let lockCount = 0;
let savedScrollY = 0;

function preventTouchMove(e: TouchEvent) {
  e.preventDefault();
}

/**
 * Apply or clear the fixed-position scroll lock styles on an element.
 * Pass a scrollY value to lock, or `null` to clear all lock styles.
 */
function setLockStyles(el: HTMLElement, scrollY: number | null): void {
  if (scrollY !== null) {
    el.style.position = "fixed";
    el.style.top = `-${scrollY}px`;
    el.style.left = "0";
    el.style.right = "0";
    el.style.overflow = "hidden";
    el.style.height = "100%";
  } else {
    el.style.position = "";
    el.style.top = "";
    el.style.left = "";
    el.style.right = "";
    el.style.overflow = "";
    el.style.height = "";
  }
}

function lock() {
  lockCount++;
  if (lockCount === 1) {
    savedScrollY = window.scrollY;
    setLockStyles(document.documentElement, savedScrollY);
    setLockStyles(document.body, savedScrollY);
    document.addEventListener("touchmove", preventTouchMove, {
      passive: false,
    });
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
    document.removeEventListener("touchmove", preventTouchMove);
    setLockStyles(document.documentElement, null);
    setLockStyles(document.body, null);
    window.scrollTo(0, savedScrollY);
  }
}

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}
