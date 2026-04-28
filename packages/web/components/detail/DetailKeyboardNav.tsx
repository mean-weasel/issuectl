"use client";

import { useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

type Props = {
  backHref: string;
};

/**
 * Keyboard shortcuts for detail pages (issue and PR).
 * - Escape: go back to the list
 * - l: click the launch button (via data-shortcut="launch")
 * - m: click the merge button (via data-shortcut="merge")
 * - ?: toggle the keyboard help overlay
 */
export function DetailKeyboardNav({ backHref }: Props) {
  const router = useRouter();
  const helpOpenRef = useRef(false);

  const shortcuts = useMemo(
    () => ({
      Escape: () => {
        // Close help overlay first if open
        if (helpOpenRef.current) {
          helpOpenRef.current = false;
          const overlay = document.getElementById("keyboard-help-overlay");
          if (overlay) overlay.style.display = "none";
          return;
        }
        router.push(backHref);
      },
      l: () => {
        const btn = document.querySelector(
          '[data-shortcut="launch"]',
        ) as HTMLButtonElement | null;
        btn?.click();
      },
      m: () => {
        const btn = document.querySelector(
          '[data-shortcut="merge"]',
        ) as HTMLButtonElement | null;
        btn?.click();
      },
      "?": () => {
        helpOpenRef.current = !helpOpenRef.current;
        const overlay = document.getElementById("keyboard-help-overlay");
        if (overlay) {
          overlay.style.display = helpOpenRef.current ? "flex" : "none";
        }
      },
    }),
    [router, backHref],
  );

  useKeyboardShortcuts(shortcuts);
  return null;
}
