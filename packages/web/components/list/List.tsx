"use client";

import { useState, useCallback, type ReactNode } from "react";
import type { Section, SortMode } from "@issuectl/core";
import { Drawer, Fab } from "@/components/paper";
import { CreateDraftSheet } from "./CreateDraftSheet";
import { NavDrawerContent } from "./NavDrawerContent";
import { FiltersSheet } from "./FiltersSheet";
import { BottomHandle } from "./BottomHandle";
import { useListCounts } from "./ListCountContext";
import { SearchProvider } from "./SearchContext";
import { SearchBar } from "./SearchBar";
import { FocusProvider } from "./FocusContext";
import { ListKeyboardNav } from "./ListKeyboardNav";
import {
  DashboardTabs,
  DashboardTopBar,
  IssueSectionTabs,
  PrAuthorToggle,
  RepoChips,
  formatDate,
  repoAccentColor,
} from "./ListNavigation";
import { buildHref } from "@/lib/list-href";
import styles from "./List.module.css";
import { PullToRefreshWrapper } from "@/components/ui/PullToRefreshWrapper";
import { KeyboardHelpOverlay } from "@/components/ui/KeyboardHelpOverlay";

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

  const handleCreateDraft = useCallback(() => setCreateOpen(true), []);

  const counts = useListCounts();
  const sectionCounts = counts?.sectionCounts ?? null;
  const totalIssueCount = counts?.totalIssueCount ?? null;
  const prCount = counts?.prCount ?? null;

  const { weekday, short } = formatDate(new Date());

  const isPrTab = activeTab === "prs";
  const hasActiveFilter = activeRepo !== null || (isPrTab && mineOnly);
  const activeRepoColor = repoAccentColor(repos, activeRepo);

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

  // Build the canonical URL for the current dashboard view and pass it as
  // `from` to settings, so the settings breadcrumb returns to this filtered view.
  const currentHref = chipHref(activeRepo);
  const settingsHref =
    currentHref === "/"
      ? "/settings"
      : `/settings?from=${encodeURIComponent(currentHref)}`;

  const mineHref = (mine: boolean | null) =>
    buildHref({ tab: "prs", repo: activeRepo, mine });

  const clearFiltersHref = hasActiveFilter
    ? buildHref({
        tab: isPrTab ? "prs" : undefined,
        section: activeTab === "issues" ? activeSection : null,
        sort: activeTab === "issues" ? activeSort : null,
      })
    : null;

  const sectionHref = (section: Section) =>
    buildHref({ repo: activeRepo, section, sort: activeSort });
  const sortHref = (sort: SortMode) =>
    buildHref({ repo: activeRepo, section: activeSection, sort });

  return (
    <SearchProvider>
    <FocusProvider>
    <PullToRefreshWrapper>
    <div className={styles.container}>
      <ListKeyboardNav
        activeTab={activeTab}
        activeSection={activeSection}
        activeRepo={activeRepo}
        activeSort={activeSort}
        mineOnly={mineOnly}
        onCreateDraft={handleCreateDraft}
      />
      <KeyboardHelpOverlay />
      <DashboardTopBar
        activeTab={activeTab}
        activeSection={activeSection}
        activeRepo={activeRepo}
        activeSort={activeSort}
        mineOnly={mineOnly}
        prCount={prCount}
        sectionCounts={sectionCounts}
        cachedAt={cachedAt}
        settingsHref={settingsHref}
        onOpenDrawer={() => setDrawerOpen(true)}
        onOpenFilters={() => setFiltersOpen(true)}
        searchBar={<SearchBar />}
      />

      <DashboardTabs
        activeTab={activeTab}
        activeSection={activeSection}
        activeSort={activeSort}
        activeRepo={activeRepo}
        activeRepoColor={activeRepoColor}
        mineOnly={mineOnly}
        prCount={prCount}
        totalIssueCount={totalIssueCount}
        hasActiveFilter={hasActiveFilter}
        weekday={weekday}
        short={short}
        onCreateDraft={() => setCreateOpen(true)}
        onOpenFilters={() => setFiltersOpen(true)}
      />

      <RepoChips repos={repos} activeRepo={activeRepo} buildHref={chipHref} />

      {activeTab === "issues" && (
        <IssueSectionTabs
          activeRepo={activeRepo}
          activeSection={activeSection}
          activeSort={activeSort}
          sectionCounts={sectionCounts}
        />
      )}

      {activeTab === "prs" && <PrAuthorToggle repos={repos} activeRepo={activeRepo} mineOnly={mineOnly} />}

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
        settingsHref={settingsHref}
        onCreateDraft={() => {
          setFiltersOpen(false);
          // Delay opening CreateDraftSheet until the FiltersSheet exit
          // animation finishes (220ms) to avoid overlapping modals.
          setTimeout(() => setCreateOpen(true), 220);
        }}
      />

      {!filtersOpen && (
        <BottomHandle onTrigger={() => setFiltersOpen(true)} />
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
    </FocusProvider>
    </SearchProvider>
  );
}
