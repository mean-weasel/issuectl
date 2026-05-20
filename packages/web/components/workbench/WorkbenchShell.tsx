"use client";

/* eslint-disable max-lines */

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { BoardFocus } from "./BoardFocus";
import { GlobalIssuesFocus } from "./GlobalIssuesFocus";
import { InstancePane } from "./InstancePane";
import { IssueFocus } from "./IssueFocus";
import { IssueQueuePane } from "./IssueQueuePane";
import { PullRequestsFocus } from "./PullRequestsFocus";
import { QuickCreateFocus } from "./QuickCreateFocus";
import { RepoOverviewFocus } from "./RepoOverviewFocus";
import { RepoRail } from "./RepoRail";
import { RepoSetupFocus } from "./RepoSetupFocus";
import { SettingsFocus } from "./SettingsFocus";
import { TerminalFocus } from "./TerminalFocus";
import { endDeploymentSession, ensureDeploymentTtyd, fetchWorkbench, isStaleEnsureTtydResult } from "./workbench-api";
import type { WorkbenchDeployment, WorkbenchIssueSummary, WorkbenchPayload, WorkbenchRepo, WorkbenchSettings } from "./workbench-types";
import {
  selectedDeployment as resolveSelectedDeployment,
  selectedRepo as resolveSelectedRepo,
} from "./workbench-selectors";
import {
  type IssueQueueFilter,
  type SessionSortMode,
  type WorkbenchColumnKey,
  type WorkbenchSectionCollapseState,
  type WorkbenchSectionId,
  DEFAULT_WORKBENCH_COLUMN_WIDTHS,
  DEFAULT_WORKBENCH_SECTION_COLLAPSE_STATE,
  WORKBENCH_COLUMN_WIDTH_LIMITS,
  WORKBENCH_COLUMN_WIDTH_STORAGE_KEY,
  type WorkbenchMode,
  sidePaneWidthsApply,
  workbenchReducer,
} from "./workbench-state";
import styles from "./WorkbenchShell.module.css";

type LoadState = { status: "loading"; data: null; error: null }
  | { status: "loaded"; data: WorkbenchPayload; error: null }
  | { status: "error"; data: null; error: string };

const NAV_ITEMS: Array<{ mode: WorkbenchMode; label: string; path: string }> = [
  { mode: "globalIssues", label: "Issues", path: "/workbench/issues" },
  { mode: "board", label: "Board", path: "/workbench/board" },
  { mode: "pullRequests", label: "PRs", path: "/workbench/prs" },
  { mode: "workbench", label: "Workbench", path: "/workbench" },
  { mode: "quickCreate", label: "Quick Create", path: "/workbench/quick-create" },
  { mode: "settings", label: "Settings", path: "/workbench/settings" },
];

const COMPACT_WORKBENCH_QUERY = "(max-width: 1099px)";

type Props = {
  initialPayload?: WorkbenchPayload | null;
  onRefreshPayload?: () => Promise<WorkbenchPayload>;
  initialMode?: WorkbenchMode;
  apiToken?: string | null;
};

export function WorkbenchShell({
  initialPayload = null,
  onRefreshPayload,
  initialMode = "workbench",
  apiToken = null,
}: Props) {
  const [selection, dispatch] = useReducer(workbenchReducer, {
    mode: initialMode,
    selectedRepoId: null,
    selectedIssueNumber: null,
    selectedDeploymentId: null,
    columnWidths: DEFAULT_WORKBENCH_COLUMN_WIDTHS,
    collapsedSections: DEFAULT_WORKBENCH_SECTION_COLLAPSE_STATE,
  });
  const [loadState, setLoadState] = useState<LoadState>(
    initialPayload
      ? { status: "loaded", data: initialPayload, error: null }
      : { status: "loading", data: null, error: null },
  );
  const [refreshState, setRefreshState] = useState<{ pending: boolean; error: string | null }>({
    pending: false,
    error: null,
  });
  const [sessionSortMode, setSessionSortMode] = useState<SessionSortMode>("running first");
  const [issueFilter, setIssueFilter] = useState<IssueQueueFilter>("open");
  const [pendingDeploymentId, setPendingDeploymentId] = useState<number | null>(null);
  const [sessionRowErrors, setSessionRowErrors] = useState<Record<number, string>>({});
  const [repoSetupRequested, setRepoSetupRequested] = useState(false);
  const [drawerCollapse, setDrawerCollapse] = useState({ instances: false, issues: false });
  const [compactLayout, setCompactLayout] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [resizingColumn, setResizingColumn] = useState<WorkbenchColumnKey | null>(null);
  const skipNextColumnWidthPersistRef = useRef(false);
  const focusPaneRef = useRef<HTMLElement | null>(null);
  const compactOverviewScrollRef = useRef<Record<number, number>>({});
  const dragRef = useRef<{
    column: WorkbenchColumnKey;
    startX: number;
    startWidth: number;
    previousUserSelect: string;
  } | null>(null);
  const payload = loadState.status === "loaded" ? loadState.data : null;

  const load = useCallback(() => {
    const controller = new AbortController();
    const refreshingExistingData = loadState.status === "loaded";
    if (refreshingExistingData) {
      setRefreshState({ pending: true, error: null });
    } else {
      setLoadState({ status: "loading", data: null, error: null });
    }
    const request = onRefreshPayload
      ? onRefreshPayload()
      : fetchWorkbench({ signal: controller.signal });
    request
      .then((data) => {
        setLoadState({ status: "loaded", data, error: null });
        setRefreshState({ pending: false, error: null });
        dispatch({ type: "payloadLoaded", payload: data });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Unable to load workbench";
        if (refreshingExistingData) {
          setRefreshState({ pending: false, error: message });
          return;
        }
        setLoadState({
          status: "error",
          data: null,
          error: message,
        });
      });
    return controller;
  }, [loadState.status, onRefreshPayload]);

  useEffect(() => {
    if (initialPayload) {
      dispatch({ type: "payloadLoaded", payload: initialPayload });
      return;
    }
    const controller = load();
    return () => controller.abort();
  }, [initialPayload, load]);

  useLayoutEffect(() => {
    if (!apiToken) return;
    window.localStorage.setItem("issuectl.apiToken", apiToken);
  }, [apiToken]);

  useEffect(() => {
    if (!payload) return;
    const syncSelectionFromUrl = () => {
      const urlSelection = selectionFromUrl(payload, window.location.pathname, window.location.search);
      dispatch({ type: "applyUrlSelection", ...urlSelection });
      setDrawerCollapse(drawersForUrlSelection(urlSelection.mode, urlSelection.issueNumber, urlSelection.deploymentId));
      setRepoSetupRequested(new URLSearchParams(window.location.search).get("repoSetup") === "1");
    };
    syncSelectionFromUrl();
    window.addEventListener("popstate", syncSelectionFromUrl);
    return () => window.removeEventListener("popstate", syncSelectionFromUrl);
  }, [payload]);

  useLayoutEffect(() => {
    const media = window.matchMedia(COMPACT_WORKBENCH_QUERY);
    const syncCompactLayout = () => setCompactLayout(media.matches);
    syncCompactLayout();
    media.addEventListener("change", syncCompactLayout);
    return () => media.removeEventListener("change", syncCompactLayout);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(WORKBENCH_COLUMN_WIDTH_STORAGE_KEY);
    if (stored) {
      try {
        const widths = JSON.parse(stored) as Partial<Record<WorkbenchColumnKey, unknown>>;
        dispatch({
          type: "setColumnWidths",
          widths: {
            instances: typeof widths.instances === "number" ? widths.instances : undefined,
            issues: typeof widths.issues === "number" ? widths.issues : undefined,
          },
        });
      } catch {
        window.localStorage.removeItem(WORKBENCH_COLUMN_WIDTH_STORAGE_KEY);
      }
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    if (skipNextColumnWidthPersistRef.current) {
      skipNextColumnWidthPersistRef.current = false;
      return;
    }
    window.localStorage.setItem(
      WORKBENCH_COLUMN_WIDTH_STORAGE_KEY,
      JSON.stringify(selection.columnWidths),
    );
  }, [selection.columnWidths, storageReady]);

  useEffect(() => () => finishColumnResize(), []);

  useEffect(() => {
    const focusPane = focusPaneRef.current;
    const shouldRestoreOverviewScroll =
      compactLayout
      && selection.mode === "workbench"
      && selection.selectedIssueNumber === null
      && selection.selectedDeploymentId === null;
    const top = shouldRestoreOverviewScroll
      ? compactOverviewScrollRef.current[overviewScrollKey(selection.selectedRepoId)] ?? 0
      : 0;
    focusPane?.scrollTo({ top, left: 0 });
    focusPane?.focus({ preventScroll: true });
  }, [
    compactLayout,
    selection.mode,
    selection.selectedDeploymentId,
    selection.selectedIssueNumber,
    selection.selectedRepoId,
  ]);

  const selectedRepo = resolveSelectedRepo(payload, selection);
  const selectedDeployment = selection.selectedDeploymentId === null
    ? null
    : selectedRepo?.deployments.find((deployment) => deployment.id === selection.selectedDeploymentId)
      ?? resolveSelectedDeployment(payload, selection);
  const selectedIssue = selectedRepo?.issues.find((issue) => issue.number === selection.selectedIssueNumber) ?? null;
  const contextLabel = workbenchContextLabel({
    mode: selection.mode,
    repo: selectedRepo,
    issue: selectedIssue,
    deployment: selectedDeployment,
  });
  const reassignTargets = payload?.repos.filter((repo) => repo.id !== selectedRepo?.id) ?? [];
  const hideSidePanes = !sidePaneWidthsApply(selection.mode);
  const compactSidePanesHidden = compactLayout || hideSidePanes;
  const instancesPaneCollapsed = compactSidePanesHidden || drawerCollapse.instances;
  const issuesPaneCollapsed = compactSidePanesHidden || drawerCollapse.issues;
  const navLabels = NAV_ITEMS.map((item) => item.label);
  const workbenchStyle = {
    "--workbench-instances-width": `${selection.columnWidths.instances}px`,
    "--workbench-issues-width": `${selection.columnWidths.issues}px`,
  } as CSSProperties;

  function selectMode(nextMode: WorkbenchMode, path: string) {
    rememberCompactOverviewScroll();
    const pathParams = new URLSearchParams(path.split("?")[1] ?? "");
    if (nextMode === "workbench" && !pathParams.has("issue") && !pathParams.has("deployment")) {
      dispatch({
        type: "applyUrlSelection",
        mode: nextMode,
        repoId: selectedRepo?.id ?? selection.selectedRepoId,
        issueNumber: null,
        deploymentId: null,
      });
    } else {
      dispatch({ type: "selectMode", mode: nextMode });
    }
    if (sidePaneWidthsApply(nextMode)) {
      setDrawerCollapse({ instances: false, issues: false });
    }
    window.history.pushState(null, "", path);
    setRepoSetupRequested(pathParams.get("repoSetup") === "1");
  }

  function modePathWithRepo(path: string): string {
    if (!selectedRepo) return path;
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}repo=${encodeURIComponent(`${selectedRepo.owner}/${selectedRepo.name}`)}`;
  }

  function selectRepo(repoId: number) {
    rememberCompactOverviewScroll();
    const repo = payload?.repos.find((item) => item.id === repoId) ?? null;
    const nextMode = repoScopedMode(selection.mode) ? selection.mode : "workbench";
    dispatch({
      type: "applyUrlSelection",
      mode: nextMode,
      repoId,
      issueNumber: null,
      deploymentId: null,
    });
    setDrawerCollapse({ instances: false, issues: false });
    window.history.pushState(null, "", repo ? workbenchRepoModeUrl(repo, nextMode, repoSetupRequested) : "/workbench");
    setRepoSetupRequested(nextMode === "settings" && repoSetupRequested);
  }

  function openRepoSetup() {
    selectMode("settings", selectedRepo ? workbenchRepoSetupUrl(selectedRepo) : "/workbench/settings?repoSetup=1");
  }

  function selectDeployment(deploymentId: number, deploymentOverride?: WorkbenchDeployment) {
    rememberCompactOverviewScroll();
    const deployment = deploymentOverride
      ?? payload?.deployments.find((item) => item.id === deploymentId)
      ?? selectedRepo?.deployments.find((item) => item.id === deploymentId)
      ?? null;
    dispatch({ type: "selectDeployment", deploymentId, repoId: deployment?.repoId ?? selectedRepo?.id ?? null });
    setDrawerCollapse({ instances: false, issues: true });
    window.history.pushState(null, "", deployment ? workbenchDeploymentUrl(deployment) : "/workbench");
    setRepoSetupRequested(false);
  }

  function selectIssue(issueNumber: number) {
    rememberCompactOverviewScroll();
    dispatch({ type: "selectIssue", issueNumber });
    setDrawerCollapse((current) => ({ ...current, instances: true, issues: false }));
    window.history.pushState(null, "", selectedRepo ? workbenchIssueUrl(selectedRepo, issueNumber) : "/workbench");
    setRepoSetupRequested(false);
  }

  function selectGlobalIssue(repoId: number, issueNumber: number) {
    rememberCompactOverviewScroll();
    dispatch({ type: "selectRepo", repoId });
    dispatch({ type: "selectIssue", issueNumber });
    setDrawerCollapse({ instances: false, issues: false });
    const repo = payload?.repos.find((item) => item.id === repoId) ?? null;
    window.history.pushState(null, "", repo ? workbenchIssueUrl(repo, issueNumber) : "/workbench");
    setRepoSetupRequested(false);
  }

  async function reconnectDeployment(deployment: WorkbenchDeployment) {
    setPendingDeploymentId(deployment.id);
    setSessionRowErrors((current) => withoutKey(current, deployment.id));
    try {
      const result = await ensureDeploymentTtyd(deployment.id);
      if (!("port" in result)) {
        if (isStaleEnsureTtydResult(result)) {
          removeDeployment(deployment.id);
          return;
        }
        throw new Error(result.error ?? "Terminal is not available");
      }
      updateDeployment(deployment.id, { ttydPort: result.port });
      selectDeployment(deployment.id);
    } catch (err) {
      setSessionRowErrors((current) => ({
        ...current,
        [deployment.id]: err instanceof Error ? err.message : "Reconnect failed",
      }));
    } finally {
      setPendingDeploymentId(null);
    }
  }

  async function endSession(deployment: WorkbenchDeployment) {
    setPendingDeploymentId(deployment.id);
    setSessionRowErrors((current) => withoutKey(current, deployment.id));
    try {
      await endDeploymentSession(deployment);
      removeDeployment(deployment.id);
    } catch (err) {
      setSessionRowErrors((current) => ({
        ...current,
        [deployment.id]: err instanceof Error ? err.message : "End session failed",
      }));
    } finally {
      setPendingDeploymentId(null);
    }
  }

  function updateDeployment(deploymentId: number, patch: Partial<WorkbenchDeployment>) {
    setLoadState((current) => {
      if (current.status !== "loaded") return current;
      const data = mapPayloadDeployments(current.data, deploymentId, (deployment) => ({
        ...deployment,
        ...patch,
      }));
      return { status: "loaded", data, error: null };
    });
  }

  function removeDeployment(deploymentId: number) {
    setLoadState((current) => {
      if (current.status !== "loaded") return current;
      return {
        status: "loaded",
        data: {
          ...current.data,
          deployments: current.data.deployments.filter((deployment) => deployment.id !== deploymentId),
          repos: current.data.repos.map((repo) => {
            const removed = repo.deployments.find((deployment) => deployment.id === deploymentId);
            const deployments = repo.deployments.filter((deployment) => deployment.id !== deploymentId);
            return {
              ...repo,
              deployments,
              badgeCount: deployments.length,
              deployedCount: deployments.length,
              issues: removed
                ? repo.issues.map((issue) =>
                  issue.number === removed.issueNumber
                    ? {
                      ...issue,
                      hasActiveDeployment: deployments.some(
                        (deployment) => deployment.issueNumber === issue.number,
                      ),
                    }
                    : issue,
                )
                : repo.issues,
            };
          }),
        },
        error: null,
      };
    });
    if (selection.selectedDeploymentId === deploymentId) {
      dispatch({ type: "clearDeployment" });
    }
  }

  function updateIssue(repoId: number, issueNumber: number, patch: Partial<WorkbenchIssueSummary>) {
    setLoadState((current) => {
      if (current.status !== "loaded") return current;
      return {
        status: "loaded",
        data: {
          ...current.data,
          repos: current.data.repos.map((repo) =>
            repo.id === repoId
              ? {
                ...repo,
                issues: repo.issues.map((issue) =>
                  issue.number === issueNumber ? { ...issue, ...patch } : issue,
                ),
              }
              : repo,
          ),
        },
        error: null,
      };
    });
  }

  function focusReassignedIssue(result: { owner: string; repo: string; issueNumber: number }) {
    const targetRepo = payload?.repos.find((repo) => repo.owner === result.owner && repo.name === result.repo);
    const sourceRepoId = selection.selectedRepoId;
    const sourceIssueNumber = selection.selectedIssueNumber;
    if (!targetRepo) return;
    setLoadState((current) => {
      if (current.status !== "loaded") return current;
      return {
        status: "loaded",
        data: {
          ...current.data,
          repos: current.data.repos.map((repo) => {
            if (repo.id === sourceRepoId && sourceIssueNumber !== null) {
              return {
                ...repo,
                issues: repo.issues.map((issue) =>
                  issue.number === sourceIssueNumber
                    ? { ...issue, state: "closed", priority: "normal" }
                    : issue,
                ),
              };
            }
            if (repo.id !== targetRepo.id || repo.issues.some((issue) => issue.number === result.issueNumber)) {
              return repo;
            }
            return {
              ...repo,
              issues: [
                {
                  number: result.issueNumber,
                  title: `Reassigned issue #${result.issueNumber}`,
                  state: "open",
                  labels: [],
                  updatedAt: new Date().toISOString(),
                  priority: "normal",
                  hasActiveDeployment: false,
                  htmlUrl: `https://github.com/${result.owner}/${result.repo}/issues/${result.issueNumber}`,
                  authorLogin: null,
                },
                ...repo.issues,
              ],
            };
          }),
        },
        error: null,
      };
    });
    queueMicrotask(() => {
      dispatch({ type: "selectRepo", repoId: targetRepo.id });
      dispatch({ type: "selectIssue", issueNumber: result.issueNumber });
      setDrawerCollapse({ instances: true, issues: false });
      window.history.pushState(null, "", workbenchIssueUrl(targetRepo, result.issueNumber));
    });
  }

  function addLaunchedSession(deployment: WorkbenchDeployment) {
    setLoadState((current) => {
      if (current.status !== "loaded") return current;
      const repoHasDeployment = (repoDeployments: WorkbenchDeployment[]) =>
        repoDeployments.some((item) => item.id === deployment.id);
      return {
        status: "loaded",
        data: {
          ...current.data,
          deployments: current.data.deployments.some((item) => item.id === deployment.id)
            ? current.data.deployments
            : [deployment, ...current.data.deployments],
          repos: current.data.repos.map((repo) => {
            if (repo.id !== deployment.repoId) return repo;
            const deployments = repoHasDeployment(repo.deployments)
              ? repo.deployments
              : [deployment, ...repo.deployments];
            return {
              ...repo,
              deployments,
              badgeCount: deployments.length,
              deployedCount: deployments.length,
              issues: repo.issues.map((issue) =>
                issue.number === deployment.issueNumber
                  ? { ...issue, hasActiveDeployment: true }
                  : issue,
              ),
            };
          }),
        },
        error: null,
      };
    });
    selectDeployment(deployment.id, deployment);
  }

  function updateRepo(updatedRepo: WorkbenchRepo) {
    setLoadState((current) => {
      if (current.status !== "loaded") return current;
      return {
        status: "loaded",
        data: {
          ...current.data,
          repos: current.data.repos.map((repo) => repo.id === updatedRepo.id ? { ...repo, ...updatedRepo } : repo),
        },
        error: null,
      };
    });
  }

  function addRepo(repo: WorkbenchRepo) {
    setLoadState((current) => {
      if (current.status !== "loaded") return current;
      if (current.data.repos.some((item) => item.id === repo.id || (item.owner === repo.owner && item.name === repo.name))) {
        return current;
      }
      return {
        status: "loaded",
        data: {
          ...current.data,
          repos: [...current.data.repos, repo],
        },
        error: null,
      };
    });
  }

  function removeRepo(owner: string, name: string) {
    const currentData = loadState.status === "loaded" ? loadState.data : null;
    const repoBeingRemoved = currentData?.repos.find((repo) => repo.owner === owner && repo.name === name);
    const nextSelectedRepoId = repoBeingRemoved?.id === selection.selectedRepoId
      ? currentData?.repos.find((repo) => repo.id !== repoBeingRemoved.id)?.id ?? null
      : undefined;

    setLoadState((current) => {
      if (current.status !== "loaded") return current;
      const removed = current.data.repos.find((repo) => repo.owner === owner && repo.name === name);
      const repos = current.data.repos.filter((repo) => repo.owner !== owner || repo.name !== name);
      return {
        status: "loaded",
        data: {
          ...current.data,
          repos,
          deployments: removed
            ? current.data.deployments.filter((deployment) => deployment.repoId !== removed.id)
            : current.data.deployments,
        },
        error: null,
      };
    });

    if (nextSelectedRepoId !== undefined) {
      dispatch({ type: "replaceSelectedRepo", repoId: nextSelectedRepoId });
    }
  }

  function updateSettings(settings: WorkbenchSettings) {
    setLoadState((current) => {
      if (current.status !== "loaded") return current;
      return {
        status: "loaded",
        data: {
          ...current.data,
          settings: { ...current.data.settings, ...settings },
        },
        error: null,
      };
    });
  }

  function rememberCompactOverviewScroll() {
    const focusPane = focusPaneRef.current;
    if (
      !compactLayout
      || !focusPane
      || selection.mode !== "workbench"
      || selection.selectedIssueNumber !== null
      || selection.selectedDeploymentId !== null
    ) {
      return;
    }
    compactOverviewScrollRef.current[overviewScrollKey(selection.selectedRepoId)] = focusPane.scrollTop;
  }

  function toggleSection(section: WorkbenchSectionId) {
    dispatch({ type: "toggleSection", section });
  }

  function beginColumnResize(column: WorkbenchColumnKey, event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    startColumnResize(column, event.clientX);
  }

  function beginColumnResizeWithMouse(column: WorkbenchColumnKey, event: ReactMouseEvent<HTMLElement>) {
    if (dragRef.current) return;
    event.preventDefault();
    startColumnResize(column, event.clientX);
  }

  function startColumnResize(column: WorkbenchColumnKey, clientX: number) {
    if (dragRef.current) return;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    dragRef.current = {
      column,
      startX: clientX,
      startWidth: selection.columnWidths[column],
      previousUserSelect,
    };
    setResizingColumn(column);
    window.addEventListener("mousemove", resizeColumnFromWindow);
    window.addEventListener("mouseup", finishColumnResize);
    window.addEventListener("pointermove", resizeColumnFromWindow);
    window.addEventListener("pointerup", finishColumnResize);
  }

  function resizeColumn(event: ReactPointerEvent<HTMLElement>) {
    resizeColumnAt(event.clientX);
  }

  function resizeColumnWithMouse(event: ReactMouseEvent<HTMLElement>) {
    resizeColumnAt(event.clientX);
  }

  function resizeColumnFromWindow(event: MouseEvent | PointerEvent) {
    resizeColumnAt(event.clientX);
  }

  function resizeColumnAt(clientX: number) {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = clientX - drag.startX;
    dispatch({
      type: "setColumnWidth",
      column: drag.column,
      width: drag.column === "instances" ? drag.startWidth + delta : drag.startWidth - delta,
    });
  }

  function finishColumnResize() {
    if (!dragRef.current) return;
    document.body.style.userSelect = dragRef.current.previousUserSelect;
    dragRef.current = null;
    setResizingColumn(null);
    window.removeEventListener("mousemove", resizeColumnFromWindow);
    window.removeEventListener("mouseup", finishColumnResize);
    window.removeEventListener("pointermove", resizeColumnFromWindow);
    window.removeEventListener("pointerup", finishColumnResize);
  }

  function nudgeColumn(column: WorkbenchColumnKey, event: KeyboardEvent<HTMLElement>) {
    const step = event.shiftKey ? 32 : 16;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    dispatch({
      type: "setColumnWidth",
      column,
      width: selection.columnWidths[column] + (column === "instances" ? direction : -direction) * step,
    });
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/workbench" className={styles.brand} aria-label="issuectl workbench">
          issuectl<span className={styles.brandDot} />
        </Link>
        <span className={styles.routeLabel} aria-label="Workbench context" title={contextLabel}>
          {contextLabel}
        </span>
        {!compactSidePanesHidden && (
          <div className={styles.toolbarTools} aria-label="Workbench layout controls">
            <button
              type="button"
              className={styles.resetColumnsButton}
              aria-label="Reset column widths"
              title="Reset column widths"
              onClick={() => {
                const storedColumnWidths = window.localStorage.getItem(WORKBENCH_COLUMN_WIDTH_STORAGE_KEY);
                skipNextColumnWidthPersistRef.current =
                  !columnsAreDefault(selection.columnWidths)
                  || (storedColumnWidths !== null && selection.columnWidths !== DEFAULT_WORKBENCH_COLUMN_WIDTHS);
                window.localStorage.removeItem(WORKBENCH_COLUMN_WIDTH_STORAGE_KEY);
                dispatch({ type: "resetColumnWidths" });
              }}
            >
              Reset
            </button>
            <div className={styles.drawerControls} aria-label="Workbench drawers">
              <button
                type="button"
                aria-pressed={!drawerCollapse.instances}
                aria-label={drawerCollapse.instances ? "Show sessions drawer" : "Hide sessions drawer"}
                onClick={() => setDrawerCollapse((current) => ({ ...current, instances: !current.instances }))}
              >
                Sessions
              </button>
              <button
                type="button"
                aria-pressed={!drawerCollapse.issues}
                aria-label={drawerCollapse.issues ? "Show issues drawer" : "Hide issues drawer"}
                onClick={() => setDrawerCollapse((current) => ({ ...current, issues: !current.issues }))}
              >
                Issues
              </button>
            </div>
          </div>
        )}
        <nav className={styles.topnav} aria-label="Workbench navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.mode}
              type="button"
              className={styles.navButton}
              data-active={selection.mode === item.mode ? "true" : undefined}
              aria-current={selection.mode === item.mode ? "page" : undefined}
              onClick={() => selectMode(item.mode, modePathWithRepo(item.path))}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main
        className={styles.workbench}
        data-mode={selection.mode}
        data-side-panes={compactSidePanesHidden ? "collapsed" : "visible"}
        data-instances-pane={instancesPaneCollapsed ? "collapsed" : "visible"}
        data-issues-pane={issuesPaneCollapsed ? "collapsed" : "visible"}
        data-resizing={resizingColumn ? "true" : undefined}
        style={workbenchStyle}
        aria-label="Workbench"
      >
        <aside className={`${styles.pane} ${styles.repoRail}`} aria-label="Repositories">
          <RepoRail
            repos={payload?.repos ?? null}
            selectedRepoId={selection.selectedRepoId}
            status={loadState.status}
            onSelectRepo={selectRepo}
            onAddRepository={openRepoSetup}
            onOpenSettings={() => selectMode("settings", modePathWithRepo("/workbench/settings"))}
          />
        </aside>

        {!compactSidePanesHidden && instancesPaneCollapsed && (
          <button
            type="button"
            className={`${styles.drawerRestoreButton} ${styles.drawerRestoreButtonLeft}`}
            aria-label="Expand running sessions"
            title="Expand running sessions"
            onClick={() => setDrawerCollapse((current) => ({ ...current, instances: false }))}
          >
            <span aria-hidden="true">&gt;</span>
          </button>
        )}

        {!instancesPaneCollapsed && (
          <aside className={`${styles.pane} ${styles.instancePane}`} aria-label="Active sessions">
            <InstancePane
              repo={selectedRepo}
              selectedDeploymentId={selection.selectedDeploymentId}
              sortMode={sessionSortMode}
              pendingDeploymentId={pendingDeploymentId}
              rowErrors={sessionRowErrors}
              onSortChange={setSessionSortMode}
              onSelectDeployment={selectDeployment}
              onReconnect={reconnectDeployment}
              onEnd={endSession}
              onCollapseDrawer={() => setDrawerCollapse((current) => ({ ...current, instances: true }))}
            />
          </aside>
        )}

        {!instancesPaneCollapsed && (
          <ColumnResizeHandle
            label="Resize instances column"
            value={selection.columnWidths.instances}
            min={WORKBENCH_COLUMN_WIDTH_LIMITS.instances.min}
            max={WORKBENCH_COLUMN_WIDTH_LIMITS.instances.max}
            column="instances"
            resizing={resizingColumn === "instances"}
            onPointerDown={beginColumnResize}
            onPointerMove={resizeColumn}
            onPointerUp={finishColumnResize}
            onMouseDown={beginColumnResizeWithMouse}
            onMouseMove={resizeColumnWithMouse}
            onMouseUp={finishColumnResize}
            onKeyDown={nudgeColumn}
          />
        )}

        <section ref={focusPaneRef} className={styles.focusPane} aria-label="Workbench focus" tabIndex={-1}>
          <FocusContent
            loadState={loadState}
            mode={selection.mode}
            selectedRepo={selectedRepo}
            selectedDeployment={selectedDeployment}
            selectedIssue={selectedIssue}
            reassignTargets={reassignTargets}
            navLabels={navLabels}
            repoSetupRequested={repoSetupRequested}
            collapsedSections={selection.collapsedSections}
            sessionsHidden={!compactSidePanesHidden && drawerCollapse.instances}
            pendingDeploymentId={pendingDeploymentId}
            sessionRowErrors={sessionRowErrors}
            onToggleSection={toggleSection}
            onShowSessions={() => setDrawerCollapse((current) => ({ ...current, instances: false }))}
            onRetry={() => {
              load();
            }}
            onRefresh={() => {
              load();
            }}
            refreshPending={refreshState.pending}
            refreshError={refreshState.error}
            onIssueUpdated={updateIssue}
            onIssueReassigned={focusReassignedIssue}
            onSelectDeployment={selectDeployment}
            onSelectIssue={selectIssue}
            onGlobalIssueSelected={selectGlobalIssue}
            onSessionLaunched={addLaunchedSession}
            onDeploymentStale={removeDeployment}
            onReconnectDeployment={reconnectDeployment}
            onEndSession={endSession}
            onBackToOverview={() => {
              selectMode("workbench", selectedRepo ? workbenchRepoUrl(selectedRepo) : "/workbench");
            }}
            onJumpToSession={selectDeployment}
            onRepoUpdated={updateRepo}
            onRepoAdded={addRepo}
            onRepoRemoved={removeRepo}
            onSettingsUpdated={updateSettings}
            onOpenRepoSetup={openRepoSetup}
            onOpenSettings={() => selectMode("settings", "/workbench/settings")}
          />
        </section>

        {!issuesPaneCollapsed && (
          <ColumnResizeHandle
            label="Resize issues column"
            value={selection.columnWidths.issues}
            min={WORKBENCH_COLUMN_WIDTH_LIMITS.issues.min}
            max={WORKBENCH_COLUMN_WIDTH_LIMITS.issues.max}
            column="issues"
            resizing={resizingColumn === "issues"}
            onPointerDown={beginColumnResize}
            onPointerMove={resizeColumn}
            onPointerUp={finishColumnResize}
            onMouseDown={beginColumnResizeWithMouse}
            onMouseMove={resizeColumnWithMouse}
            onMouseUp={finishColumnResize}
            onKeyDown={nudgeColumn}
          />
        )}

        {!issuesPaneCollapsed && (
          <aside className={`${styles.pane} ${styles.issuePane}`} aria-label="Repo issues">
            <IssueQueuePane
              repo={selectedRepo}
              filter={issueFilter}
              selectedIssueNumber={selection.selectedIssueNumber}
              onFilterChange={setIssueFilter}
              onSelectIssue={selectIssue}
              onJumpToSession={selectDeployment}
              onCollapseDrawer={() => setDrawerCollapse((current) => ({ ...current, issues: true }))}
            />
          </aside>
        )}

        {!compactSidePanesHidden && issuesPaneCollapsed && (
          <button
            type="button"
            className={`${styles.drawerRestoreButton} ${styles.drawerRestoreButtonRight}`}
            aria-label="Expand issues drawer"
            title="Expand issues drawer"
            onClick={() => setDrawerCollapse((current) => ({ ...current, issues: false }))}
          >
            <span aria-hidden="true">&lt;</span>
          </button>
        )}
      </main>
    </div>
  );
}

function FocusContent({
  loadState,
  mode,
  selectedRepo,
  selectedDeployment,
  selectedIssue,
  reassignTargets,
  navLabels,
  repoSetupRequested,
  collapsedSections,
  sessionsHidden,
  pendingDeploymentId,
  sessionRowErrors,
  onToggleSection,
  onShowSessions,
  onRetry,
  onRefresh,
  refreshPending,
  refreshError,
  onIssueUpdated,
  onIssueReassigned,
  onSelectDeployment,
  onSelectIssue,
  onGlobalIssueSelected,
  onSessionLaunched,
  onDeploymentStale,
  onReconnectDeployment,
  onEndSession,
  onBackToOverview,
  onJumpToSession,
  onRepoUpdated,
  onRepoAdded,
  onRepoRemoved,
  onSettingsUpdated,
  onOpenRepoSetup,
  onOpenSettings,
}: {
  loadState: LoadState;
  mode: WorkbenchMode;
  selectedRepo: WorkbenchPayload["repos"][number] | null;
  selectedDeployment: WorkbenchDeployment | null;
  selectedIssue: WorkbenchPayload["repos"][number]["issues"][number] | null;
  reassignTargets: WorkbenchPayload["repos"][number][];
  navLabels: string[];
  repoSetupRequested: boolean;
  collapsedSections: WorkbenchSectionCollapseState;
  sessionsHidden: boolean;
  pendingDeploymentId: number | null;
  sessionRowErrors: Record<number, string>;
  onToggleSection: (section: WorkbenchSectionId) => void;
  onShowSessions: () => void;
  onRetry: () => void;
  onRefresh: () => void;
  refreshPending: boolean;
  refreshError: string | null;
  onIssueUpdated: (repoId: number, issueNumber: number, patch: Partial<WorkbenchIssueSummary>) => void;
  onIssueReassigned: (result: { owner: string; repo: string; issueNumber: number }) => void;
  onSelectDeployment: (deploymentId: number) => void;
  onSelectIssue: (issueNumber: number) => void;
  onGlobalIssueSelected: (repoId: number, issueNumber: number) => void;
  onSessionLaunched: (deployment: WorkbenchDeployment) => void;
  onDeploymentStale: (deploymentId: number) => void;
  onReconnectDeployment: (deployment: WorkbenchDeployment) => void;
  onEndSession: (deployment: WorkbenchDeployment) => void;
  onBackToOverview: () => void;
  onJumpToSession: (deploymentId: number) => void;
  onRepoUpdated: (repo: WorkbenchRepo) => void;
  onRepoAdded: (repo: WorkbenchRepo) => void;
  onRepoRemoved: (owner: string, name: string) => void;
  onSettingsUpdated: (settings: WorkbenchSettings) => void;
  onOpenRepoSetup: () => void;
  onOpenSettings: () => void;
}) {
  if (loadState.status === "loading") {
    return (
      <div className={styles.focusInner}>
        <p className={styles.kicker}>Loading</p>
        <h1>Opening workbench</h1>
        <p className={styles.muted}>Preparing repositories, sessions, and issue queues.</p>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className={styles.focusInner} role="alert">
        <p className={styles.kicker}>Workbench unavailable</p>
        <h1>Unable to load workbench</h1>
        <p className={styles.muted}>{loadState.error}</p>
        <button type="button" className={styles.primaryButton} onClick={onRetry}>
          Retry workbench load
        </button>
      </div>
    );
  }

  if (mode === "settings" && repoSetupRequested) {
    return (
      <RepoSetupFocus
        repos={loadState.data.repos}
        selectedRepo={selectedRepo}
        onRepoUpdated={onRepoUpdated}
        onRepoAdded={onRepoAdded}
        onRepoRemoved={onRepoRemoved}
      />
    );
  }

  if (mode === "settings") {
    return (
      <SettingsFocus
        payload={loadState.data}
        collapsedSections={collapsedSections}
        onToggleSection={onToggleSection}
        onSettingsUpdated={onSettingsUpdated}
      />
    );
  }

  if (loadState.data.repos.length === 0) {
    return (
      <div className={styles.focusInner}>
        <p className={styles.kicker}>Setup</p>
        <h1>No tracked repositories</h1>
        <div className={styles.emptyActions}>
          <button
            type="button"
            className={styles.primaryButton}
            aria-label="Add repository"
            onClick={onOpenRepoSetup}
          >
            Add repository
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            aria-label="Open settings"
            onClick={onOpenSettings}
          >
            Open settings
          </button>
        </div>
      </div>
    );
  }

  if (mode === "globalIssues") {
    return (
      <GlobalIssuesFocus
        repos={loadState.data.repos}
        onSelectIssue={onGlobalIssueSelected}
      />
    );
  }

  if (mode === "board") {
    return (
      <BoardFocus
        repos={loadState.data.repos}
        deployments={loadState.data.deployments}
        onSelectIssue={onGlobalIssueSelected}
      />
    );
  }

  if (mode === "quickCreate") {
    return <QuickCreateFocus repos={loadState.data.repos} selectedRepo={selectedRepo} />;
  }

  if (mode === "pullRequests") {
    return <PullRequestsFocus selectedRepo={selectedRepo} />;
  }

  if (mode === "workbench" && selectedIssue) {
    return selectedRepo ? (
      <IssueFocus
        repo={selectedRepo}
        issue={selectedIssue}
        reassignTargets={reassignTargets}
        currentUserLogin={loadState.data.user.login}
        collapsedSections={collapsedSections}
        sessionsHidden={sessionsHidden}
        hasHiddenSessions={selectedRepo.deployments.some((deployment) =>
          deployment.state === "active" && deployment.endedAt === null,
        )}
        onToggleSection={onToggleSection}
        onShowSessions={onShowSessions}
        onIssueUpdated={(issueNumber, patch) => onIssueUpdated(selectedRepo.id, issueNumber, patch)}
        onIssueReassigned={onIssueReassigned}
        onSessionLaunched={onSessionLaunched}
        onJumpToSession={onJumpToSession}
      />
    ) : null;
  }

  if (mode === "workbench" && selectedDeployment) {
    return (
      <TerminalFocus
        deployment={selectedDeployment}
        repo={selectedRepo}
        pending={pendingDeploymentId === selectedDeployment.id}
        rowError={sessionRowErrors[selectedDeployment.id]}
        onReconnect={onReconnectDeployment}
        onEnd={onEndSession}
        onBackToOverview={onBackToOverview}
        onDeploymentStale={onDeploymentStale}
      />
    );
  }

  if (mode === "workbench" && selectedRepo) {
    return (
      <RepoOverviewFocus
        repo={selectedRepo}
        health={loadState.data.health}
        onRefresh={onRefresh}
        refreshPending={refreshPending}
        refreshError={refreshError}
        onSelectDeployment={onSelectDeployment}
        onSelectIssue={onSelectIssue}
        onOpenRepoSetup={onOpenRepoSetup}
      />
    );
  }

  const modeTitle = titleForMode(mode);
  return (
    <div className={styles.focusInner}>
      <p className={styles.kicker}>{modeTitle}</p>
      <h1>{selectedRepo ? `${selectedRepo.owner}/${selectedRepo.name}` : "Workbench"}</h1>
      <p className={styles.muted}>
        {modeTitle} surface selected from {navLabels.join(", ")}.
      </p>
    </div>
  );
}

function ColumnResizeHandle({
  label,
  value,
  min,
  max,
  column,
  resizing,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onKeyDown,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  column: WorkbenchColumnKey;
  resizing: boolean;
  onPointerDown: (column: WorkbenchColumnKey, event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onMouseDown: (column: WorkbenchColumnKey, event: ReactMouseEvent<HTMLElement>) => void;
  onMouseMove: (event: ReactMouseEvent<HTMLElement>) => void;
  onMouseUp: () => void;
  onKeyDown: (column: WorkbenchColumnKey, event: KeyboardEvent<HTMLElement>) => void;
}) {
  return (
    <div
      className={styles.columnResizeHandle}
      data-resizing={resizing ? "true" : undefined}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={(event) => onPointerDown(column, event)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onMouseDown={(event) => onMouseDown(column, event)}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onKeyDown={(event) => onKeyDown(column, event)}
    />
  );
}

function mapPayloadDeployments(
  payload: WorkbenchPayload,
  deploymentId: number,
  mapper: (deployment: WorkbenchDeployment) => WorkbenchDeployment,
): WorkbenchPayload {
  return {
    ...payload,
    deployments: payload.deployments.map((deployment) =>
      deployment.id === deploymentId ? mapper(deployment) : deployment,
    ),
    repos: payload.repos.map((repo) => ({
      ...repo,
      deployments: repo.deployments.map((deployment) =>
        deployment.id === deploymentId ? mapper(deployment) : deployment,
      ),
    })),
  };
}

function withoutKey(record: Record<number, string>, key: number): Record<number, string> {
  const next = { ...record };
  delete next[key];
  return next;
}

function columnsAreDefault(widths: Record<WorkbenchColumnKey, number>): boolean {
  return widths.instances === DEFAULT_WORKBENCH_COLUMN_WIDTHS.instances
    && widths.issues === DEFAULT_WORKBENCH_COLUMN_WIDTHS.issues;
}

function overviewScrollKey(repoId: number | null): number {
  return repoId ?? 0;
}

type UrlSelection = {
  mode: WorkbenchMode;
  repoId: number | null;
  issueNumber: number | null;
  deploymentId: number | null;
};

function selectionFromUrl(payload: WorkbenchPayload, pathname: string, search: string): UrlSelection {
  const mode = modeFromPath(pathname);
  const params = new URLSearchParams(search);
  const requestedRepo = repoFromUrlParam(payload, params.get("repo")) ?? payload.repos[0] ?? null;

  if (mode !== "workbench") {
    return {
      mode,
      repoId: requestedRepo?.id ?? null,
      issueNumber: null,
      deploymentId: null,
    };
  }

  const deploymentId = numberParam(params.get("deployment"));
  if (deploymentId !== null) {
    const deployment = payload.deployments.find((item) => item.id === deploymentId);
    if (deployment) {
      return {
        mode,
        repoId: deployment.repoId,
        issueNumber: null,
        deploymentId: deployment.id,
      };
    }
  }

  const issueNumber = numberParam(params.get("issue"));
  if (requestedRepo && issueNumber !== null && requestedRepo.issues.some((issue) => issue.number === issueNumber)) {
    return {
      mode,
      repoId: requestedRepo.id,
      issueNumber,
      deploymentId: null,
    };
  }

  return {
    mode,
    repoId: requestedRepo?.id ?? null,
    issueNumber: null,
    deploymentId: null,
  };
}

function drawersForUrlSelection(
  mode: WorkbenchMode,
  issueNumber: number | null,
  deploymentId: number | null,
): { instances: boolean; issues: boolean } {
  if (!sidePaneWidthsApply(mode)) return { instances: false, issues: false };
  if (deploymentId !== null) return { instances: false, issues: true };
  if (issueNumber !== null) return { instances: true, issues: false };
  return { instances: false, issues: false };
}

function repoFromUrlParam(payload: WorkbenchPayload, value: string | null): WorkbenchRepo | null {
  if (!value) return null;
  const [owner, name] = value.split("/");
  if (!owner || !name) return null;
  return payload.repos.find((repo) => repo.owner === owner && repo.name === name) ?? null;
}

function numberParam(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function workbenchRepoUrl(repo: Pick<WorkbenchRepo, "owner" | "name">): string {
  return `/workbench?repo=${encodeURIComponent(`${repo.owner}/${repo.name}`)}`;
}

function workbenchRepoSetupUrl(repo: Pick<WorkbenchRepo, "owner" | "name">): string {
  return `/workbench/settings?repoSetup=1&repo=${encodeURIComponent(`${repo.owner}/${repo.name}`)}`;
}

function workbenchIssueUrl(repo: Pick<WorkbenchRepo, "owner" | "name">, issueNumber: number): string {
  return `${workbenchRepoUrl(repo)}&issue=${issueNumber}`;
}

function workbenchDeploymentUrl(deployment: Pick<WorkbenchDeployment, "owner" | "repoName" | "id">): string {
  return `/workbench?repo=${encodeURIComponent(`${deployment.owner}/${deployment.repoName}`)}&deployment=${deployment.id}`;
}

function workbenchRepoModeUrl(
  repo: Pick<WorkbenchRepo, "owner" | "name">,
  mode: WorkbenchMode,
  repoSetupRequested: boolean,
): string {
  const repoParam = `repo=${encodeURIComponent(`${repo.owner}/${repo.name}`)}`;
  if (mode === "pullRequests") {
    return `/workbench/prs?${repoParam}`;
  }
  if (mode === "quickCreate") {
    return `/workbench/quick-create?${repoParam}`;
  }
  if (mode === "settings") {
    return repoSetupRequested
      ? `/workbench/settings?repoSetup=1&${repoParam}`
      : `/workbench/settings?${repoParam}`;
  }
  return workbenchRepoUrl(repo);
}

function repoScopedMode(mode: WorkbenchMode): boolean {
  return mode === "pullRequests" || mode === "quickCreate" || mode === "settings";
}

function modeFromPath(pathname: string): WorkbenchMode {
  if (pathname.endsWith("/issues")) return "globalIssues";
  if (pathname.endsWith("/board")) return "board";
  if (pathname.endsWith("/prs")) return "pullRequests";
  if (pathname.endsWith("/quick-create")) return "quickCreate";
  if (pathname.endsWith("/settings")) return "settings";
  return "workbench";
}

function workbenchContextLabel({
  mode,
  repo,
  issue,
  deployment,
}: {
  mode: WorkbenchMode;
  repo: WorkbenchRepo | null;
  issue: WorkbenchIssueSummary | null;
  deployment: WorkbenchDeployment | null;
}): string {
  if (mode === "globalIssues") return "Issues";
  if (mode === "board") return "Board";
  if (mode === "pullRequests") return repo ? `${repo.owner}/${repo.name} PRs` : "PRs";
  if (mode === "quickCreate") return repo ? `${repo.owner}/${repo.name} quick create` : "Quick Create";
  if (mode === "settings") return repo ? `${repo.owner}/${repo.name} settings` : "Settings";
  if (repo && deployment) return `${repo.owner}/${repo.name} #${deployment.issueNumber} terminal`;
  if (repo && issue) return `${repo.owner}/${repo.name} #${issue.number}`;
  if (repo) return `${repo.owner}/${repo.name}`;
  return "Workbench";
}

function titleForMode(mode: WorkbenchMode): string {
  switch (mode) {
    case "globalIssues":
      return "Issues";
    case "board":
      return "Board";
    case "pullRequests":
      return "PRs";
    case "quickCreate":
      return "Quick Create";
    case "settings":
      return "Settings";
    case "workbench":
      return "Workbench";
  }
}
