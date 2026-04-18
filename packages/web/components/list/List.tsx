"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import type { GitHubPull, Section, SortMode, UnifiedList } from "@issuectl/core";
import { Drawer, Fab } from "@/components/paper";
import { REPO_COLORS } from "@/lib/constants";
import { repoKey } from "@/lib/repo-key";
import { ListSection } from "./ListSection";
import { PrListRow } from "./PrListRow";
import { CreateDraftSheet } from "./CreateDraftSheet";
import { NavDrawerContent } from "./NavDrawerContent";
import { RepoFilterChips } from "./RepoFilterChips";
import { FiltersSheet } from "./FiltersSheet";
import { FilterEdgeSwipe } from "./FilterEdgeSwipe";
import { buildHref } from "@/lib/list-href";
import styles from "./List.module.css";
import { PullToRefreshWrapper } from "@/components/ui/PullToRefreshWrapper";

type Repo = { owner: string; name: string };
type PrEntry = { repo: Repo; pull: GitHubPull };

type Props = {
  data: UnifiedList;
  activeTab: "issues" | "prs";
  activeSection: Section;
  activeSort: SortMode;
  prCount: number;
  prs: PrEntry[];
  username: string | null;
  repos: Repo[];
  activeRepo: string | null;
  mineOnly: boolean;
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
  in_focus: "in focus",
  in_flight: "in flight",
  shipped: "shipped",
};

const SECTION_EMPTY: Record<Section, { title: string; body: string }> = {
  unassigned: {
    title: "no drafts",
    body: "start a draft with the + button — it'll live here until you assign it to a repo.",
  },
  in_focus: {
    title: "all clear",
    body: "nothing on your plate. breathe, or draft the next one.",
  },
  in_flight: {
    title: "nothing in flight",
    body: "when you launch an issue, it lands here while you work on it.",
  },
  shipped: {
    title: "nothing shipped yet",
    body: "closed issues show up here once PRs merge and reconcile.",
  },
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
  data,
  activeTab,
  activeSection,
  prCount,
  prs,
  username,
  repos,
  activeRepo,
  activeSort,
  mineOnly,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sectionCounts: Record<Section, number> = {
    unassigned: data.unassigned.length,
    in_focus: data.in_focus.length,
    in_flight: data.in_flight.length,
    shipped: data.shipped.length,
  };
  const totalIssueCount =
    sectionCounts.unassigned +
    sectionCounts.in_focus +
    sectionCounts.in_flight +
    sectionCounts.shipped;

  const { weekday, short } = formatDate(new Date());

  const visibleSections: Section[] = activeRepo
    ? ["in_focus", "in_flight", "shipped"]
    : ["unassigned", "in_focus", "in_flight", "shipped"];

  const isPrTab = activeTab === "prs";
  const hasActiveFilter = activeRepo !== null || (isPrTab && mineOnly);
  const activeRepoIndex = activeRepo
    ? repos.findIndex((r) => repoKey(r) === activeRepo)
    : -1;
  const activeRepoColor =
    activeRepoIndex >= 0
      ? REPO_COLORS[activeRepoIndex % REPO_COLORS.length]
      : undefined;

  const PAGE_SIZE = 15;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when section changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeSection]);

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, activeSection]);

  const issuesHref = buildHref({ repo: activeRepo, sort: activeSort });
  const prsHref = buildHref({
    tab: "prs",
    repo: activeRepo,
    mine: mineOnly ? true : null,
  });

  const chipHref = (repoKey: string | null) =>
    buildHref({
      tab: activeTab,
      repo: repoKey,
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

  // On mobile the scope pill replaces the repo chip row as the visible
  // "you're filtered to X" indicator. Clearing the repo from the pill keeps
  // any author filter intact (since they're orthogonal).
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
        <h1 className={styles.brand}>
          issuectl<span className={styles.dot} />
        </h1>
        <nav className={styles.desktopNav}>
          <Link href="/parse" className={styles.desktopNavLink}>Quick Create</Link>
          <span className={styles.desktopNavSep}>·</span>
          <Link href="/settings" className={styles.desktopNavLink}>Settings</Link>
        </nav>
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
          Issues<span className={styles.count}>{totalIssueCount}</span>
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
          <span className={styles.count}>{prCount}</span>
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
              const count = sectionCounts[section];
              return (
                <Link
                  key={section}
                  href={sectionHref(section)}
                  className={isActive ? styles.sectionTabActive : styles.sectionTab}
                  aria-current={isActive ? "page" : undefined}
                >
                  {SECTION_LABEL[section]}
                  <span className={styles.sectionTabCount}>{count}</span>
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

      {activeTab === "issues" ? (
        <>
          {renderIssueSection({
            activeSection,
            data,
            visibleCount,
          })}
          {(() => {
            const totalItems =
              activeSection === "unassigned"
                ? data.unassigned.length
                : activeSection === "in_focus"
                  ? data.in_focus.length
                  : activeSection === "in_flight"
                    ? data.in_flight.length
                    : data.shipped.length;
            return visibleCount < totalItems ? (
              <div ref={sentinelRef} className={styles.sentinel} />
            ) : null;
          })()}
        </>
      ) : prCount === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyMark}>❧</div>
          <h3>no pull requests</h3>
          <p>
            <em>
              {activeRepo && mineOnly
                ? `no open PRs from you in ${activeRepo}.`
                : activeRepo
                  ? `no open PRs in ${activeRepo}.`
                  : mineOnly
                    ? "no open PRs from you across your repos."
                    : "no open PRs across your repos."}
            </em>
          </p>
        </div>
      ) : (
        <div>
          {prs.map(({ repo, pull }) => (
            <PrListRow
              key={`pr-${repo.owner}-${repo.name}-${pull.number}`}
              owner={repo.owner}
              repoName={repo.name}
              pull={pull}
            />
          ))}
        </div>
      )}

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

function renderIssueSection({
  activeSection,
  data,
  visibleCount,
}: {
  activeSection: Section;
  data: UnifiedList;
  visibleCount: number;
}) {
  const allItems =
    activeSection === "unassigned"
      ? data.unassigned
      : activeSection === "in_focus"
        ? data.in_focus
        : activeSection === "in_flight"
          ? data.in_flight
          : data.shipped;

  if (allItems.length === 0) {
    const empty = SECTION_EMPTY[activeSection];
    return (
      <div className={styles.empty}>
        <div className={styles.emptyMark}>❧</div>
        <h3>{empty.title}</h3>
        <p><em>{empty.body}</em></p>
      </div>
    );
  }

  const items = allItems.slice(0, visibleCount);
  return <ListSection title={null} items={items} />;
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
        ×
      </Link>
    </span>
  );
}
