"use client";

import { useEffect, useState } from "react";
import { clearDashboardDefaultPreset, readDashboardDefaultPreset, writeDashboardDefaultPreset } from "./dashboard-default-prefs";
import {
  boardPresetState,
  globalIssuePresetState,
  type DashboardPresetId,
} from "./dashboard-presets";
import {
  dashboardUrlSearch,
  DEFAULT_BOARD_URL_STATE,
  DEFAULT_GLOBAL_ISSUE_URL_STATE,
  hasDashboardUrlState,
  parseBoardUrlState,
  parseGlobalIssueUrlState,
  type BoardUrlState,
  type DashboardSurface,
  type GlobalIssueUrlState,
} from "./dashboard-url-state";

export type DashboardDefaultPresetControls = {
  clearDefaultPresetId: () => void;
  defaultPresetId: DashboardPresetId | null;
  resetDashboardFilters: () => void;
  setDefaultPresetId: (presetId: DashboardPresetId) => void;
};

export function useGlobalIssueDashboardUrlState(): [
  GlobalIssueUrlState,
  (patch: Partial<GlobalIssueUrlState>) => void,
  DashboardDefaultPresetControls,
] {
  return useDashboardUrlState(
    "globalIssues",
    DEFAULT_GLOBAL_ISSUE_URL_STATE,
    parseGlobalIssueUrlState,
    globalIssuePresetState,
  );
}

export function useBoardDashboardUrlState(): [
  BoardUrlState,
  (patch: Partial<BoardUrlState>) => void,
  DashboardDefaultPresetControls,
] {
  return useDashboardUrlState(
    "board",
    DEFAULT_BOARD_URL_STATE,
    parseBoardUrlState,
    boardPresetState,
  );
}

function useDashboardUrlState<TState extends GlobalIssueUrlState | BoardUrlState>(
  surface: DashboardSurface,
  fallback: TState,
  parse: (search: string) => TState,
  presetState: (presetId: DashboardPresetId) => TState,
): [TState, (patch: Partial<TState>) => void, DashboardDefaultPresetControls] {
  const initialDefaultPresetId = typeof window === "undefined" ? null : readDashboardDefaultPreset(surface);
  const [defaultPresetId, setDefaultPresetIdState] = useState<DashboardPresetId | null>(initialDefaultPresetId);
  const [state, setState] = useState<TState>(() => {
    if (typeof window === "undefined") return fallback;
    return stateFromLocation(window.location.search, parse, presetState, initialDefaultPresetId);
  });

  useEffect(() => {
    const syncFromUrl = () =>
      setState(stateFromLocation(window.location.search, parse, presetState, defaultPresetId));
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [defaultPresetId, parse, presetState]);

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

  const setDefaultPresetId = (presetId: DashboardPresetId) => {
    writeDashboardDefaultPreset(surface, presetId);
    setDefaultPresetIdState(presetId);
    if (typeof window !== "undefined" && !hasDashboardUrlState(window.location.search)) {
      setState(presetState(presetId));
    }
  };

  const clearDefaultPresetId = () => {
    clearDashboardDefaultPreset(surface);
    setDefaultPresetIdState(null);
    if (typeof window !== "undefined" && !hasDashboardUrlState(window.location.search)) {
      setState(fallback);
    }
  };

  const resetDashboardFilters = () => {
    clearDashboardDefaultPreset(surface);
    setDefaultPresetIdState(null);
    updateState(fallback);
  };

  return [state, updateState, {
    clearDefaultPresetId,
    defaultPresetId,
    resetDashboardFilters,
    setDefaultPresetId,
  }];
}

function stateFromLocation<TState>(
  search: string,
  parse: (search: string) => TState,
  presetState: (presetId: DashboardPresetId) => TState,
  defaultPresetId: DashboardPresetId | null,
): TState {
  if (hasDashboardUrlState(search) || !defaultPresetId) return parse(search);
  return presetState(defaultPresetId);
}
