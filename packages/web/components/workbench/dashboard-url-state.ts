import type { DashboardIssueView } from "./dashboard-issue-views";

export type GlobalIssueStatusFilter = "all" | "open" | "running" | "closed";
export type GlobalIssueSortMode = "updated" | "priority";
export type BoardSortMode = "payload" | "priority";
export type DashboardSurface = "globalIssues" | "board";

export type GlobalIssueUrlState = {
  view: DashboardIssueView;
  status: GlobalIssueStatusFilter;
  sort: GlobalIssueSortMode;
  query: string;
};

export type BoardUrlState = {
  view: DashboardIssueView;
  sort: BoardSortMode;
  runningOnly: boolean;
  query: string;
};

export const DEFAULT_GLOBAL_ISSUE_URL_STATE: GlobalIssueUrlState = {
  view: "all",
  status: "all",
  sort: "updated",
  query: "",
};

export const DEFAULT_BOARD_URL_STATE: BoardUrlState = {
  view: "all",
  sort: "payload",
  runningOnly: false,
  query: "",
};

const DASHBOARD_VIEWS = new Set<DashboardIssueView>(["all", "attention", "running", "cached", "errors"]);
const GLOBAL_STATUSES = new Set<GlobalIssueStatusFilter>(["all", "open", "running", "closed"]);
const GLOBAL_SORTS = new Set<GlobalIssueSortMode>(["updated", "priority"]);
const BOARD_SORTS = new Set<BoardSortMode>(["payload", "priority"]);
const DASHBOARD_PARAM_NAMES = ["view", "status", "sort", "running", "q"];

export function parseGlobalIssueUrlState(search: string | URLSearchParams): GlobalIssueUrlState {
  const params = searchParams(search);
  return {
    view: oneOf(params.get("view"), DASHBOARD_VIEWS, DEFAULT_GLOBAL_ISSUE_URL_STATE.view),
    status: oneOf(params.get("status"), GLOBAL_STATUSES, DEFAULT_GLOBAL_ISSUE_URL_STATE.status),
    sort: oneOf(params.get("sort"), GLOBAL_SORTS, DEFAULT_GLOBAL_ISSUE_URL_STATE.sort),
    query: params.get("q")?.trim() ?? "",
  };
}

export function parseBoardUrlState(search: string | URLSearchParams): BoardUrlState {
  const params = searchParams(search);
  return {
    view: oneOf(params.get("view"), DASHBOARD_VIEWS, DEFAULT_BOARD_URL_STATE.view),
    sort: oneOf(params.get("sort"), BOARD_SORTS, DEFAULT_BOARD_URL_STATE.sort),
    runningOnly: params.get("running") === "1",
    query: params.get("q")?.trim() ?? "",
  };
}

export function dashboardUrlSearch(
  surface: DashboardSurface,
  currentSearch: string | URLSearchParams,
  state: GlobalIssueUrlState | BoardUrlState,
): string {
  const params = searchParams(currentSearch);
  for (const name of DASHBOARD_PARAM_NAMES) {
    params.delete(name);
  }

  if (state.view !== "all") params.set("view", state.view);
  if (state.query.trim()) params.set("q", state.query.trim());

  if (surface === "globalIssues") {
    const globalState = state as GlobalIssueUrlState;
    if (globalState.status !== "all") params.set("status", globalState.status);
    if (globalState.sort !== "updated") params.set("sort", globalState.sort);
  } else {
    const boardState = state as BoardUrlState;
    if (boardState.runningOnly) params.set("running", "1");
    if (boardState.sort !== "payload") params.set("sort", boardState.sort);
  }

  const search = params.toString();
  return search ? `?${search}` : "";
}

function searchParams(search: string | URLSearchParams): URLSearchParams {
  return search instanceof URLSearchParams ? new URLSearchParams(search) : new URLSearchParams(search);
}

function oneOf<T extends string>(value: string | null, allowed: Set<T>, fallback: T): T {
  return value && allowed.has(value as T) ? value as T : fallback;
}
