"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Section, SortMode } from "@issuectl/core";
import { repoKey } from "@/lib/repo-key";
import { REPO_COLORS } from "@/lib/constants";
import { buildHref } from "@/lib/list-href";
import { CacheAge } from "@/components/ui/CacheAge";
import { VersionBadge } from "@/components/ui/VersionBadge";
import { RepoFilterChips } from "./RepoFilterChips";
import styles from "./List.module.css";

type Repo = { owner: string; name: string };

const SORT_MODES: SortMode[] = ["updated", "created", "priority"];

const SORT_LABEL: Record<SortMode, string> = {
  updated: "updated",
  created: "created",
  priority: "priority",
};

export const SECTION_LABEL: Record<Section, string> = {
  unassigned: "drafts",
  open: "open",
  running: "running",
  closed: "closed",
};

export function formatDate(d: Date): { weekday: string; short: string } {
  const weekday = d
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase();
  const short = d
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toLowerCase();
  return { weekday, short };
}

export function DashboardTopBar({
  activeTab,
  activeSection,
  mineOnly,
  prCount,
  sectionCounts,
  cachedAt,
  settingsHref,
  onOpenDrawer,
  onOpenFilters,
  searchBar,
}: {
  activeTab: "issues" | "prs";
  activeSection: Section;
  mineOnly: boolean;
  prCount: number | null;
  sectionCounts: Partial<Record<Section, number>> | null;
  cachedAt?: number | null;
  settingsHref: string;
  onOpenDrawer: () => void;
  onOpenFilters: () => void;
  searchBar: ReactNode;
}) {
  const contextSectionLabel =
    activeTab === "issues" ? SECTION_LABEL[activeSection] : mineOnly ? "mine" : "everyone";

  return (
    <div className={styles.topBar}>
      <h1 className={styles.brand}>
        <span className={styles.brandFull}>issuectl</span>
        <span className={styles.brandCompact}>ic</span>
        <span className={styles.dot} />
        <VersionBadge className={styles.versionBadge} />
      </h1>
      <button className={styles.contextLabel} onClick={onOpenFilters} aria-label="Open command sheet">
        {activeTab === "issues" ? "issues" : "PRs"}
        <span className={styles.contextSep}>›</span>
        <span className={styles.contextSection}>{contextSectionLabel}</span>
        {sectionCounts && activeTab === "issues" && (
          <span className={styles.contextCount}>{sectionCounts[activeSection] ?? ""}</span>
        )}
        {activeTab === "prs" && prCount !== null && <span className={styles.contextCount}>{prCount}</span>}
      </button>
      {searchBar}
      <CacheAge cachedAt={cachedAt ?? null} />
      <nav className={styles.desktopNav}>
        <Link href="/parse" className={styles.desktopNavLink}>Quick Create</Link>
        <span className={styles.desktopNavSep}>·</span>
        <Link href={settingsHref} className={styles.desktopNavLink}>Settings</Link>
      </nav>
      <button className={styles.sheetMenuBtn} onClick={onOpenFilters} aria-label="Open navigation">
        <FilterIcon />
      </button>
      <button className={styles.menuBtn} onClick={onOpenDrawer} aria-label="Open navigation">
        <svg width="20" height="16" viewBox="0 0 20 16" fill="none" aria-hidden="true">
          <path
            d="M2 2h16M2 8h16M2 14h16"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

export function DashboardTabs({
  activeTab,
  activeSection,
  activeSort,
  activeRepo,
  activeRepoColor,
  mineOnly,
  prCount,
  totalIssueCount,
  hasActiveFilter,
  weekday,
  short,
  onCreateDraft,
  onOpenFilters,
}: {
  activeTab: "issues" | "prs";
  activeSection: Section;
  activeSort: SortMode;
  activeRepo: string | null;
  activeRepoColor: string | undefined;
  mineOnly: boolean;
  prCount: number | null;
  totalIssueCount: number | null;
  hasActiveFilter: boolean;
  weekday: string;
  short: string;
  onCreateDraft: () => void;
  onOpenFilters: () => void;
}) {
  const issuesHref = buildHref({ repo: activeRepo, sort: activeSort });
  const prsHref = buildHref({ tab: "prs", repo: activeRepo, mine: mineOnly ? true : null });
  const clearRepoHref = buildHref({
    tab: activeTab === "prs" ? "prs" : undefined,
    mine: activeTab === "prs" && mineOnly ? true : null,
    section: activeTab === "issues" ? activeSection : null,
    sort: activeTab === "issues" ? activeSort : null,
  });

  return (
    <div className={styles.tabs}>
      <DashboardTab
        href={issuesHref}
        active={activeTab === "issues"}
        label="Issues"
        count={totalIssueCount}
        scope={activeTab === "issues" ? activeRepo : null}
        scopeColor={activeRepoColor}
        clearHref={clearRepoHref}
      />
      <DashboardTab
        href={prsHref}
        active={activeTab === "prs"}
        label={<><span className={styles.tabLabelFull}>Pull requests</span><span className={styles.tabLabelShort}>PRs</span></>}
        count={prCount}
        scope={activeTab === "prs" ? activeRepo : null}
        scopeColor={activeRepoColor}
        clearHref={clearRepoHref}
      />
      <div className={styles.desktopDate}>{weekday} · <b>{short}</b></div>
      {activeTab === "issues" && (
        <>
          <Link href="/new" className={styles.desktopNewIssueBtn}>+ new issue</Link>
          <button type="button" className={styles.desktopDraftBtn} onClick={onCreateDraft}>+ draft</button>
        </>
      )}
      <button type="button" className={styles.filterBtn} onClick={onOpenFilters} aria-label="Open filters" aria-haspopup="dialog">
        <FilterIcon />
        {hasActiveFilter && <span className={styles.filterBtnDot} aria-hidden />}
      </button>
    </div>
  );
}

export function RepoChips({ repos, activeRepo, buildHref }: {
  repos: Repo[];
  activeRepo: string | null;
  buildHref: (repoKey: string | null) => string;
}) {
  return (
    <div className={styles.desktopChipRow}>
      <RepoFilterChips repos={repos} activeRepo={activeRepo} buildHref={buildHref} />
    </div>
  );
}

export function IssueSectionTabs({
  activeRepo,
  activeSection,
  activeSort,
  sectionCounts,
}: {
  activeRepo: string | null;
  activeSection: Section;
  activeSort: SortMode;
  sectionCounts: Partial<Record<Section, number>> | null;
}) {
  const visibleSections: Section[] = activeRepo
    ? ["open", "running", "closed"]
    : ["unassigned", "open", "running", "closed"];
  const sectionHref = (section: Section) => buildHref({ repo: activeRepo, section, sort: activeSort });
  const sortHref = (sort: SortMode) => buildHref({ repo: activeRepo, section: activeSection, sort });

  return (
    <>
      <nav className={styles.sectionTabs} aria-label="Filter by section">
        {visibleSections.map((section) => {
          const isActive = section === activeSection;
          const count = sectionCounts?.[section] ?? null;
          const tabClass = !isActive
            ? styles.sectionTab
            : section === "running"
              ? styles.sectionTabRunning
              : styles.sectionTabActive;
          return (
            <Link key={section} href={sectionHref(section)} className={tabClass} aria-current={isActive ? "page" : undefined}>
              {SECTION_LABEL[section]}
              <span className={styles.sectionTabCount}>{count !== null ? count : "·"}</span>
            </Link>
          );
        })}
      </nav>
      <div className={styles.sortToggle} role="group" aria-label="Sort order">
        <span className={styles.sortLabel}>sort:</span>
        {SORT_MODES.map((mode) => (
          <Link
            key={mode}
            href={sortHref(mode)}
            className={mode === activeSort ? styles.sortOptionActive : styles.sortOption}
            aria-current={mode === activeSort ? "true" : undefined}
          >
            {SORT_LABEL[mode]}
          </Link>
        ))}
      </div>
    </>
  );
}

export function PrAuthorToggle({
  repos,
  activeRepo,
  mineOnly,
}: {
  repos: Repo[];
  activeRepo: string | null;
  mineOnly: boolean;
}) {
  if (repos.length === 0) return null;
  const mineHref = (mine: boolean | null) => buildHref({ tab: "prs", repo: activeRepo, mine });
  return (
    <div className={styles.mineToggle} role="tablist" aria-label="Author filter">
      <Link href={mineHref(null)} className={!mineOnly ? styles.mineOptionActive : styles.mineOption} aria-current={!mineOnly ? "page" : undefined}>
        everyone
      </Link>
      <Link href={mineHref(true)} className={mineOnly ? styles.mineOptionActive : styles.mineOption} aria-current={mineOnly ? "page" : undefined}>
        mine
      </Link>
    </div>
  );
}

export function repoAccentColor(repos: Repo[], activeRepo: string | null): string | undefined {
  const activeRepoIndex = activeRepo ? repos.findIndex((r) => repoKey(r) === activeRepo) : -1;
  return activeRepoIndex >= 0 ? REPO_COLORS[activeRepoIndex % REPO_COLORS.length] : undefined;
}

function DashboardTab({
  href,
  active,
  label,
  count,
  scope,
  scopeColor,
  clearHref,
}: {
  href: string;
  active: boolean;
  label: ReactNode;
  count: number | null;
  scope: string | null;
  scopeColor: string | undefined;
  clearHref: string;
}) {
  return (
    <Link href={href} className={`${styles.tab} ${active ? styles.on : ""}`}>
      {label}
      <span className={styles.count}>{count !== null ? count : "·"}</span>
      {scope && <ScopePill label={scope.split("/").pop() ?? scope} color={scopeColor} clearHref={clearHref} />}
    </Link>
  );
}

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M2 4h14M4 9h10M7 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ScopePill({ label, color, clearHref }: { label: string; color: string | undefined; clearHref: string }) {
  return (
    <span className={styles.scopePill}>
      {color && <span className={styles.scopePillDot} style={{ background: color }} aria-hidden />}
      <span className={styles.scopePillLabel}>{label}</span>
      <Link href={clearHref} className={styles.scopePillClear} aria-label={`Clear ${label} filter`} onClick={(e) => e.stopPropagation()}>
        &times;
      </Link>
    </span>
  );
}
