"use client";

import { useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Section, SortMode } from "@issuectl/core";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useFocusContext } from "./FocusContext";
import { useListCounts } from "./ListCountContext";
import { buildHref } from "@/lib/list-href";

type Props = {
  activeTab: "issues" | "prs";
  activeSection: Section;
  activeRepo: string | null;
  activeSort: SortMode;
  mineOnly: boolean;
  onCreateDraft: () => void;
};

/** Sections in tab-order for 1/2/3/4 shortcuts */
const SECTIONS: Section[] = ["unassigned", "open", "running", "closed"];

/**
 * Client component that adds keyboard shortcuts to the list view.
 * Rendered inside FocusProvider so it can read/write focusedIndex.
 * Derives item count from ListCountContext (set by the server component).
 */
export function ListKeyboardNav({
  activeTab,
  activeSection,
  activeRepo,
  activeSort,
  mineOnly,
  onCreateDraft,
}: Props) {
  const router = useRouter();
  const focus = useFocusContext();
  const counts = useListCounts();
  const helpOpenRef = useRef(false);

  // Derive visible item count from the counts context
  const itemCount =
    activeTab === "prs"
      ? (counts?.prCount ?? 0)
      : (counts?.sectionCounts[activeSection] ?? 0);

  const moveFocus = useCallback(
    (delta: number) => {
      if (!focus || itemCount === 0) return;
      const { focusedIndex, setFocusedIndex } = focus;
      let next: number;
      if (focusedIndex < 0) {
        // Nothing focused yet — start at first (j) or last (k)
        next = delta > 0 ? 0 : itemCount - 1;
      } else {
        next = (focusedIndex + delta + itemCount) % itemCount;
      }
      setFocusedIndex(next);

      // Scroll the focused row into view
      requestAnimationFrame(() => {
        const row = document.querySelector(`[data-row-index="${next}"]`);
        row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    },
    [focus, itemCount],
  );

  const openFocused = useCallback(() => {
    if (!focus || focus.focusedIndex < 0) return;
    const row = document.querySelector(
      `[data-row-index="${focus.focusedIndex}"]`,
    );
    const link = row?.querySelector("a[href]") as HTMLAnchorElement | null;
    if (link) {
      router.push(link.href);
    }
  }, [focus, router]);

  const shortcuts = useMemo(
    () => ({
      j: () => moveFocus(1),
      k: () => moveFocus(-1),
      Enter: () => openFocused(),
      n: () => router.push("/new"),
      d: () => onCreateDraft(),
      i: () =>
        router.push(
          buildHref({
            repo: activeRepo,
            section: activeSection,
            sort: activeSort,
          }),
        ),
      p: () =>
        router.push(
          buildHref({
            tab: "prs",
            repo: activeRepo,
            mine: mineOnly ? true : null,
          }),
        ),
      "1": () =>
        activeTab === "issues"
          ? router.push(
              buildHref({ repo: activeRepo, section: SECTIONS[0], sort: activeSort }),
            )
          : undefined,
      "2": () =>
        activeTab === "issues"
          ? router.push(
              buildHref({ repo: activeRepo, section: SECTIONS[1], sort: activeSort }),
            )
          : undefined,
      "3": () =>
        activeTab === "issues"
          ? router.push(
              buildHref({ repo: activeRepo, section: SECTIONS[2], sort: activeSort }),
            )
          : undefined,
      "4": () =>
        activeTab === "issues"
          ? router.push(
              buildHref({ repo: activeRepo, section: SECTIONS[3], sort: activeSort }),
            )
          : undefined,
      "?": () => {
        helpOpenRef.current = !helpOpenRef.current;
        const overlay = document.getElementById("keyboard-help-overlay");
        if (overlay) {
          overlay.style.display = helpOpenRef.current ? "flex" : "none";
        }
      },
      Escape: () => {
        // Close help overlay if open
        if (helpOpenRef.current) {
          helpOpenRef.current = false;
          const overlay = document.getElementById("keyboard-help-overlay");
          if (overlay) overlay.style.display = "none";
        }
      },
    }),
    [
      moveFocus,
      openFocused,
      router,
      activeTab,
      activeSection,
      activeRepo,
      activeSort,
      mineOnly,
      onCreateDraft,
    ],
  );

  useKeyboardShortcuts(shortcuts);

  // Reset focus when tab/section/repo changes
  useEffect(() => {
    focus?.setFocusedIndex(-1);
  }, [activeTab, activeSection, activeRepo]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
