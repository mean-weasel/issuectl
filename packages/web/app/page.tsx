import { Suspense } from "react";
import {
  getDb,
  listRepos,
  dbExists,
  getOldestCacheAge,
  SORT_MODES,
  type Section,
  type SortMode,
} from "@issuectl/core";
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";
import { resolveActiveRepo } from "@/lib/page-filters";
import { getAuthStatus } from "@/lib/auth";
import { List } from "@/components/list/List";
import { ListCountProvider } from "@/components/list/ListCountContext";
import { ContentSkeleton } from "@/components/list/ContentSkeleton";
import { DashboardContent } from "./DashboardContent";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    tab?: string;
    repo?: string;
    mine?: string;
    section?: string;
    sort?: string;
  }>;
};

const SECTIONS: readonly Section[] = [
  "unassigned",
  "open",
  "running",
  "closed",
];

// Map legacy URL params so old bookmarks still work.
const SECTION_MIGRATION: Record<string, string> = {
  in_focus: "open",
  in_flight: "running",
  shipped: "closed",
};

export default async function MainListPage({ searchParams }: Props) {
  if (!dbExists()) {
    return <WelcomeScreen />;
  }

  const db = getDb();
  const repos = listRepos(db);
  if (repos.length === 0) {
    return <WelcomeScreen />;
  }

  const {
    tab,
    repo: repoParam,
    mine: mineParam,
    section: sectionParam,
    sort: sortParam,
  } = await searchParams;
  const activeTab = tab === "prs" ? "prs" : "issues";
  const activeRepo = resolveActiveRepo(repoParam, repos);
  const mineOnly = mineParam === "1";
  const resolvedSection = SECTION_MIGRATION[sectionParam ?? ""] ?? sectionParam;
  const activeSection: Section = (SECTIONS as readonly string[]).includes(
    resolvedSection ?? "",
  )
    ? (resolvedSection as Section)
    : "open";
  const activeSort: SortMode = (SORT_MODES as readonly string[]).includes(
    sortParam ?? "",
  )
    ? (sortParam as SortMode)
    : "updated";

  const repoList = repos.map((r) => ({ owner: r.owner, name: r.name }));
  const cachedAt = getOldestCacheAge(db);

  const auth = await getAuthStatus();
  const username = auth.authenticated ? auth.username : null;

  return (
    <ListCountProvider>
      <List
        activeTab={activeTab}
        activeSection={activeSection}
        activeSort={activeSort}
        activeRepo={activeRepo}
        mineOnly={mineOnly}
        repos={repoList}
        username={username}
        cachedAt={cachedAt}
      >
        <Suspense fallback={<ContentSkeleton />}>
          <DashboardContent
            repos={repoList}
            activeTab={activeTab}
            activeSection={activeSection}
            activeSort={activeSort}
            activeRepo={activeRepo}
            mineOnly={mineOnly}
            username={username}
          />
        </Suspense>
      </List>
    </ListCountProvider>
  );
}
