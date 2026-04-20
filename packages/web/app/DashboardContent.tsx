import {
  getDb,
  getOctokit,
  getUnifiedList,
  getPulls,
  mapLimit,
  DEFAULT_REPO_FANOUT,
  type Section,
  type SortMode,
} from "@issuectl/core";
import { ListCountUpdater } from "@/components/list/ListCountContext";
import { ListContent } from "@/components/list/ListContent";
import { DashboardError } from "@/components/ui/DashboardError";
import {
  filterPrs,
  type PrEntry,
} from "@/lib/page-filters";

type Repo = { owner: string; name: string };

function parseRepoKey(key: string): { owner: string; name: string } | null {
  const idx = key.indexOf("/");
  if (idx < 1) return null;
  return { owner: key.slice(0, idx), name: key.slice(idx + 1) };
}

type Props = {
  repos: Repo[];
  activeTab: "issues" | "prs";
  activeSection: Section;
  activeSort: SortMode;
  activeRepo: string | null;
  mineOnly: boolean;
  username: string | null;
};

/**
 * Async Server Component — fetches GitHub data (issues + PRs).
 * Designed to be wrapped in <Suspense> so the dashboard shell
 * renders immediately while this streams in.
 */
export async function DashboardContent({
  repos,
  activeTab,
  activeSection,
  activeSort,
  activeRepo,
  mineOnly,
  username,
}: Props) {
  try {
    const db = getDb();
    const octokit = await getOctokit();

    const repoFilter = activeRepo ? parseRepoKey(activeRepo) : null;
    const targetRepos = repoFilter
      ? repos.filter(
          (r) => r.owner === repoFilter.owner && r.name === repoFilter.name,
        )
      : repos;

    const [data, allPrs] = await Promise.all([
      getUnifiedList(db, octokit, activeSort, repoFilter),
      gatherPulls(db, octokit, targetRepos),
    ]);

    const filteredPrs = filterPrs(allPrs, null, mineOnly ? username : null);

    const sectionCounts: Record<Section, number> = {
      unassigned: data.unassigned.length,
      open: data.open.length,
      running: data.running.length,
      closed: data.closed.length,
    };

    const totalIssueCount =
      sectionCounts.unassigned +
      sectionCounts.open +
      sectionCounts.running +
      sectionCounts.closed;

    return (
      <ListCountUpdater
        sectionCounts={sectionCounts}
        totalIssueCount={totalIssueCount}
        prCount={filteredPrs.length}
      >
        <ListContent
          activeTab={activeTab}
          activeSection={activeSection}
          data={data}
          prs={filteredPrs}
          activeRepo={activeRepo}
          mineOnly={mineOnly}
        />
      </ListCountUpdater>
    );
  } catch (err) {
    console.error("[issuectl] DashboardContent failed to load:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    // Don't push counts — leaving them null keeps the "·" placeholder
    // in tabs, signalling "unavailable" rather than a misleading "0".
    return <DashboardError message={message} />;
  }
}

async function gatherPulls(
  db: ReturnType<typeof getDb>,
  octokit: Awaited<ReturnType<typeof getOctokit>>,
  repos: Repo[],
): Promise<PrEntry[]> {
  const prResults = await mapLimit(repos, DEFAULT_REPO_FANOUT, async (repo) => {
    try {
      const { pulls } = await getPulls(db, octokit, repo.owner, repo.name);
      return pulls.map((pull) => ({
        repo: { owner: repo.owner, name: repo.name },
        pull,
      }));
    } catch (err) {
      console.error(
        `[issuectl] getPulls failed for ${repo.owner}/${repo.name} — PRs for this repo will be missing:`,
        err instanceof Error ? err.message : err,
      );
      return [];
    }
  });
  return prResults.flat();
}
