"use client";

import { useEffect, useState } from "react";
import {
  dashboardUrlSearch,
  DEFAULT_BOARD_URL_STATE,
  DEFAULT_GLOBAL_ISSUE_URL_STATE,
  parseBoardUrlState,
  parseGlobalIssueUrlState,
  type BoardUrlState,
  type DashboardSurface,
  type GlobalIssueUrlState,
} from "./dashboard-url-state";

export function useGlobalIssueDashboardUrlState(): [
  GlobalIssueUrlState,
  (patch: Partial<GlobalIssueUrlState>) => void,
] {
  return useDashboardUrlState(
    "globalIssues",
    DEFAULT_GLOBAL_ISSUE_URL_STATE,
    parseGlobalIssueUrlState,
  );
}

export function useBoardDashboardUrlState(): [
  BoardUrlState,
  (patch: Partial<BoardUrlState>) => void,
] {
  return useDashboardUrlState(
    "board",
    DEFAULT_BOARD_URL_STATE,
    parseBoardUrlState,
  );
}

function useDashboardUrlState<TState extends GlobalIssueUrlState | BoardUrlState>(
  surface: DashboardSurface,
  fallback: TState,
  parse: (search: string) => TState,
): [TState, (patch: Partial<TState>) => void] {
  const [state, setState] = useState<TState>(() =>
    typeof window === "undefined" ? fallback : parse(window.location.search),
  );

  useEffect(() => {
    const syncFromUrl = () => setState(parse(window.location.search));
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [parse]);

  const updateState = (patch: Partial<TState>) => {
    setState((current) => {
      const next = { ...current, ...patch };
      if (typeof window !== "undefined") {
        const nextSearch = dashboardUrlSearch(surface, window.location.search, next);
        window.history.replaceState(null, "", `${window.location.pathname}${nextSearch}${window.location.hash}`);
      }
      return next;
    });
  };

  return [state, updateState];
}
