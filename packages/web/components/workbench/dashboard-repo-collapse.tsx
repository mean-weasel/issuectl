"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { WorkbenchRepo } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type DashboardRepoCollapseSurface = "board" | "globalIssues";
type RepoIdentity = Pick<WorkbenchRepo, "name" | "owner">;

type DashboardRepoCollapseState = {
  collapseAll: (repos: RepoIdentity[]) => void;
  expandAll: (repos: RepoIdentity[]) => void;
  isCollapsed: (repo: RepoIdentity) => boolean;
  toggleRepo: (repo: RepoIdentity) => void;
};

const STORAGE_KEYS: Record<DashboardRepoCollapseSurface, string> = {
  board: "issuectl.dashboard.collapsedRepos.board",
  globalIssues: "issuectl.dashboard.collapsedRepos.globalIssues",
};

export function useDashboardRepoCollapse(
  surface: DashboardRepoCollapseSurface,
  repos: RepoIdentity[],
): DashboardRepoCollapseState {
  const knownRepoKeys = useMemo(() => repos.map(dashboardRepoKey), [repos]);
  const [collapsedRepoKeys, setCollapsedRepoKeys] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const knownKeys = new Set(knownRepoKeys);
    setCollapsedRepoKeys(new Set(readCollapsedRepoKeys(surface).filter((key) => knownKeys.has(key))));
    setHydrated(true);
  }, [knownRepoKeys, surface]);

  useEffect(() => {
    if (!hydrated) return;
    const knownKeys = new Set(knownRepoKeys);
    writeCollapsedRepoKeys(surface, [...collapsedRepoKeys].filter((key) => knownKeys.has(key)));
  }, [collapsedRepoKeys, hydrated, knownRepoKeys, surface]);

  const isCollapsed = useCallback(
    (repo: RepoIdentity) => collapsedRepoKeys.has(dashboardRepoKey(repo)),
    [collapsedRepoKeys],
  );
  const toggleRepo = useCallback((repo: RepoIdentity) => {
    const key = dashboardRepoKey(repo);
    setCollapsedRepoKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const collapseAll = useCallback((visibleRepos: RepoIdentity[]) => {
    setCollapsedRepoKeys((current) => new Set([...current, ...visibleRepos.map(dashboardRepoKey)]));
  }, []);
  const expandAll = useCallback((visibleRepos: RepoIdentity[]) => {
    const visibleKeys = new Set(visibleRepos.map(dashboardRepoKey));
    setCollapsedRepoKeys((current) => new Set([...current].filter((key) => !visibleKeys.has(key))));
  }, []);

  return { collapseAll, expandAll, isCollapsed, toggleRepo };
}

export function DashboardRepoGroupingControls({
  ariaLabel,
  collapse,
  repos,
}: {
  ariaLabel: string;
  collapse: DashboardRepoCollapseState;
  repos: RepoIdentity[];
}) {
  const disabled = repos.length === 0;

  return (
    <div className={styles.compactButtonGroup} role="group" aria-label={ariaLabel}>
      <button type="button" className={styles.secondaryButton} onClick={() => collapse.collapseAll(repos)} disabled={disabled}>
        Collapse all repos
      </button>
      <button type="button" className={styles.secondaryButton} onClick={() => collapse.expandAll(repos)} disabled={disabled}>
        Expand all repos
      </button>
    </div>
  );
}

export function DashboardRepoHeader({
  children,
  collapsed,
  onToggle,
  repo,
}: {
  children?: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  repo: RepoIdentity;
}) {
  const label = dashboardRepoKey(repo);

  return (
    <header className={styles.repoDashboardHeader}>
      <div className={styles.repoDashboardHeading}>
        <h2>{label}</h2>
        {children}
      </div>
      <button
        type="button"
        className={`${styles.secondaryButton} ${styles.repoCollapseButton}`}
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        {collapsed ? "Expand" : "Collapse"} {label}
      </button>
    </header>
  );
}

export function dashboardRepoKey(repo: RepoIdentity): string {
  return `${repo.owner}/${repo.name}`;
}

function readCollapsedRepoKeys(surface: DashboardRepoCollapseSurface): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEYS[surface]) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeCollapsedRepoKeys(surface: DashboardRepoCollapseSurface, keys: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEYS[surface], JSON.stringify(keys));
}
