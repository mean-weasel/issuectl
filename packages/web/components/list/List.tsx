"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { Section, SortMode } from "@issuectl/core";
import { Drawer, Fab } from "@/components/paper";
import { repoKey } from "@/lib/repo-key";
import { REPO_COLORS } from "@/lib/constants";
import { CreateDraftSheet } from "./CreateDraftSheet";
import { NavDrawerContent } from "./NavDrawerContent";
import { RepoFilterChips } from "./RepoFilterChips";
import { FiltersSheet } from "./FiltersSheet";
import { FilterEdgeSwipe } from "./FilterEdgeSwipe";
import { useListCounts } from "./ListCountContext";
import { buildHref } from "@/lib/list-href";
import styles from "./List.module.css";
import { PullToRefreshWrapper } from "@/components/ui/PullToRefreshWrapper";
import { CacheAge } from "@/components/ui/CacheAge";

type Repo = { owner: string; name: string };

type Props = {
  activeTab: "issues" | "prs";
  activeSection: Section;
  activeSort: SortMode;
  username: string | null;
  repos: Repo[];
  activeRepo: string | null;
  mineOnly: boolean;
  children: ReactNode;
  cachedAt?: number | null;
};

const SORT_MODES: SortMode[] = ["updated", "created", "priority"];

const SORT_LABEL: Record<SortMode, string> = {
  updated: "updated",
  created: "created",
  priority: "priority",
};

// Lowercase is intentional — matches the Paper mockup typography.
const SECTION_LABEL: Record<Section, string> = {
  unassigned: "drafts",
  open: "open",
  running: "running",
  closed: "closed",
};

function formatDate(d: Date): { weekday: string; short: string } {
  const weekday = d
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase();
  const short = d
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toLowerCase();
  return { weekday, short };
}

export function List({
  activeTab,
  activeSection,
  activeSort,
  username,
  repos,
  activeRepo,
  mineOnly,
  children,
  cachedAt,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const counts = useListCounts();
  const sectionCounts = counts?.sectionCounts ?? null;
  const totalIssueCount = counts?.totalIssueCount ?? null;
  const prCount = counts?.prCount ?? null;

  const { weekday, short } = formatDate(new Date());

  const visibleSections: Section[] = activeRepo
    ? ["open", "running", "closed"]
    : ["unassigned", "open", "running", "closed"];

  const isPrTab = activeTab === "prs";
  const hasActiveFilter = activeRepo !== null || (isPrTab && mineOnly);
  const activeRepoIndex = activeRepo
    ? repos.findIndex((r) => repoKey(r) === activeRepo)
    : -1;
  const activeRepoColor =
    activeRepoIndex >= 0
      ? REPO_COLORS[activeRepoIndex % REPO_COLORS.length]
      : undefined;

  const issuesHref = buildHref({ repo: activeRepo, sort: activeSort });
  const prsHref = buildHref({
    tab: "prs",
    repo: activeRepo,
    mine: mineOnly ? true : null,
  });

  const tabHref = (tab: "issues" | "prs") =>
    buildHref({
      tab: tab === "prs" ? "prs" : undefined,
      repo: activeRepo,
      section: tab === "issues" ? activeSection : null,
      sort: tab === "issues" ? activeSort : null,
      mine: tab === "prs" && mineOnly ? true : null,
    });

  const chipHref = (rk: string | null) =>
    buildHref({
      tab: activeTab,
      repo: rk,
      mine: isPrTab && mineOnly ? true : null,
      section: activeTab === "issues" ? activeSection : null,
      sort: activeTab === "issues" ? activeSort : null,
    });

  const sectionHref = (section: Section) =>
    buildHref({ repo: activeRepo, section, sort: activeSort });

  const sortHref = (sort: SortMode) =>
    buildHref({ repo: activeRepo, section: activeSection, sort });

  const mineHref = (mine: boolean | null) =>
    buildHref({ tab: "prs", repo: activeRepo, mine });

  const clearFiltersHref = hasActiveFilter
    ? buildHref({
        tab: isPrTab ? "prs" : undefined,
        section: activeTab === "issues" ? activeSection : null,
        sort: activeTab === "issues" ? activeSort : null,
      })
    : null;

  // Clearing the repo filter keeps any author filter intact — they're
  // orthogonal (mobile scope pill replaces the chip row as the visible
  // "you're filtered to X" indicator).
  const clearRepoHref = buildHref({
    tab: isPrTab ? "prs" : undefined,
    mine: isPrTab && mineOnly ? true : null,
    section: activeTab === "issues" ? activeSection : null,
    sort: activeTab === "issues" ? activeSort : null,
  });

  return (
    <PullToRefreshWrapper>
    <div className={styles.container}>
      <div className={styles.topBar}>
        {/* Brand: full on desktop, compact on mobile */}
        <h1 className={styles.brand}>
          <span className={styles.brandFull}>issuectl</span>
          <span className={styles.brandCompact}>ic</span>
          <span className={styles.dot} />
        </h1>

        {/* Mobile: context breadcrumb — tappable to open sheet */}
        <button
          className={styles.contextLabel}
          onClick={() => setFiltersOpen(true)}
          aria-label="Open command sheet"
        >
          {activeTab === "issues" ? "issues" : "PRs"}
          <span className={styles.contextSep}>›</span>
          <span className={styles.contextSection}>
            {activeTab === "issues"
              ? SECTION_LABEL[activeSection]
              : mineOnly
                ? "mine"
                : "everyone"}
          </span>
          {sectionCounts && activeTab === "issues" && (
            <span className={styles.contextCount}>
              {sectionCounts[activeSection] ?? ""}
            </span>
          )}
          {activeTab === "prs" && prCount !== null && (
            <span className={styles.contextCount}>{prCount}</span>
          )}
        </button>

        <CacheAge cachedAt={cachedAt ?? null} />
        <nav className={styles.desktopNav}>
          <Link href="/parse" className={styles.desktopNavLink}>Quick Create</Link>
          <span className={styles.desktopNavSep}>·</span>
          <Link href="/settings" className={styles.desktopNavLink}>Settings</Link>
        </nav>

        {/* Mobile: single menu button to open command sheet */}
        <button
          className={styles.sheetMenuBtn}
          onClick={() => setFiltersOpen(true)}
          aria-label="Open command sheet"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2 4h14M4 9h10M7 14h4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Desktop: hamburger for drawer (currently hidden via display:none) */}
        <button
          className={styles.menuBtn}
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
        >
          <svg
            width="20"
            height="16"
            viewBox="0 0 20 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2 2h16M2 8h16M2 14h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className={styles.tabs}>
        <Link
          href={issuesHref}
          className={`${styles.tab} ${activeTab === "issues" ? styles.on : ""}`}
        >
          Issues
          <span className={styles.count}>
            {totalIssueCount !== null ? totalIssueCount : "·"}
          </span>
          {activeTab === "issues" && activeRepo && (
            <ScopePill
              label={activeRepo.split("/").pop() ?? activeRepo}
              color={activeRepoColor}
              clearHref={clearRepoHref}
            />
          )}
        </Link>
        <Link
          href={prsHref}
          className={`${styles.tab} ${activeTab === "prs" ? styles.on : ""}`}
        >
          <span className={styles.tabLabelFull}>Pull requests</span>
          <span className={styles.tabLabelShort}>PRs</span>
          <span className={styles.count}>
            {prCount !== null ? prCount : "·"}
          </span>
          {activeTab === "prs" && activeRepo && (
            <ScopePill
              label={activeRepo.split("/").pop() ?? activeRepo}
              color={activeRepoColor}
              clearHref={clearRepoHref}
            />
          )}
        </Link>
        <div className={styles.desktopDate}>
          {weekday} · <b>{short}</b>
        </div>
        {activeTab === "issues" && (
          <button
            type="button"
            className={styles.desktopDraftBtn}
            onClick={() => setCreateOpen(true)}
          >
            + draft
          </button>
        )}
        <button
          type="button"
          className={styles.filterBtn}
          onClick={() => setFiltersOpen(true)}
          aria-label="Open filters"
          aria-haspopup="dialog"
        >
          <FilterIcon />
          {hasActiveFilter && <span className={styles.filterBtnDot} aria-hidden />}
        </button>
      </div>

      <div className={styles.desktopChipRow}>
        <RepoFilterChips
          repos={repos}
          activeRepo={activeRepo}
          buildHref={chipHref}
        />
      </div>

      {activeTab === "issues" && (
        <>
          <nav className={styles.sectionTabs} aria-label="Filter by section">
            {visibleSections.map((section) => {
              const isActive = section === activeSection;
              const count = sectionCounts?.[section] ?? null;
              let tabClass: string;
              if (!isActive) {
                tabClass = styles.sectionTab;
              } else if (section === "running") {
                tabClass = styles.sectionTabRunning;
              } else {
                tabClass = styles.sectionTabActive;
              }
              return (
                <Link
                  key={section}
                  href={sectionHref(section)}
                  className={tabClass}
                  aria-current={isActive ? "page" : undefined}
                >
                  {SECTION_LABEL[section]}
                  <span className={styles.sectionTabCount}>
                    {count !== null ? count : "·"}
                  </span>
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
      )}

      {activeTab === "prs" && repos.length > 0 && (
        <div
          className={styles.mineToggle}
          role="tablist"
          aria-label="Author filter"
        >
          <Link
            href={mineHref(null)}
            className={!mineOnly ? styles.mineOptionActive : styles.mineOption}
            aria-current={!mineOnly ? "page" : undefined}
          >
            everyone
          </Link>
          <Link
            href={mineHref(true)}
            className={mineOnly ? styles.mineOptionActive : styles.mineOption}
            aria-current={mineOnly ? "page" : undefined}
          >
            mine
          </Link>
        </div>
      )}

      {children}

      {activeTab === "issues" && (
        <>
          <Fab
            aria-label="Create a new draft"
            onClick={() => setCreateOpen(true)}
          />
          <CreateDraftSheet
            open={createOpen}
            onClose={() => setCreateOpen(false)}
          />
        </>
      )}

      <FiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        repos={repos}
        activeRepo={activeRepo}
        showAuthor={isPrTab}
        mineOnly={mineOnly}
        username={username}
        repoHref={chipHref}
        mineHref={mineHref}
        clearHref={clearFiltersHref}
        showSort={!isPrTab}
        activeSort={activeSort}
        sortHref={sortHref}
        activeTab={activeTab}
        tabHref={tabHref}
        activeSection={activeSection}
        sectionHref={sectionHref}
        sectionCounts={sectionCounts}
        onCreateDraft={() => {
          setFiltersOpen(false);
          setCreateOpen(true);
        }}
      />

      {!filtersOpen && (
        <FilterEdgeSwipe onTrigger={() => setFiltersOpen(true)} />
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={
          <>
            issuectl<span className={styles.drawerDot} />
          </>
        }
      >
        <NavDrawerContent activeTab={activeTab} username={username} />
      </Drawer>
    </div>
    </PullToRefreshWrapper>
  );
}

function FilterIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 4h14M4 9h10M7 14h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ScopePill({
  label,
  color,
  clearHref,
}: {
  label: string;
  color: string | undefined;
  clearHref: string;
}) {
  return (
    <span className={styles.scopePill}>
      {color && (
        <span
          className={styles.scopePillDot}
          style={{ background: color }}
          aria-hidden
        />
      )}
      <span className={styles.scopePillLabel}>{label}</span>
      <Link
        href={clearHref}
        className={styles.scopePillClear}
        aria-label={`Clear ${label} filter`}
        onClick={(e) => e.stopPropagation()}
      >
        &times;
      </Link>
    </span>
  );
}
