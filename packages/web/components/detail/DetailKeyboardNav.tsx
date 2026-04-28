"use client";

import { useMemo } from "react";
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

  const shortcuts = useMemo(
    () => ({
      Escape: () => {
        // Close help overlay first if open
        const overlay = document.getElementById("keyboard-help-overlay");
        if (overlay && overlay.style.display !== "none") {
          overlay.style.display = "none";
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
        const overlay = document.getElementById("keyboard-help-overlay");
        if (overlay) {
          const isVisible = overlay.style.display !== "none";
          overlay.style.display = isVisible ? "none" : "flex";
        }
      },
    }),
    [router, backHref],
  );

  useKeyboardShortcuts(shortcuts);
  return null;
}
