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
import {
  filterPrs,
  filterUnifiedList,
  type PrEntry,
} from "@/lib/page-filters";

type Repo = { owner: string; name: string };

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

    const [data, allPrs] = await Promise.all([
      getUnifiedList(db, octokit, activeSort),
      gatherPulls(db, octokit, repos),
    ]);

    const filteredData = filterUnifiedList(data, activeRepo);
    const filteredPrs = filterPrs(allPrs, activeRepo, mineOnly ? username : null);

    const sectionCounts: Record<Section, number> = {
      unassigned: filteredData.unassigned.length,
      in_focus: filteredData.in_focus.length,
      in_flight: filteredData.in_flight.length,
      shipped: filteredData.shipped.length,
    };

    const totalIssueCount =
      sectionCounts.unassigned +
      sectionCounts.in_focus +
      sectionCounts.in_flight +
      sectionCounts.shipped;

    return (
      <ListCountUpdater
        sectionCounts={sectionCounts}
        totalIssueCount={totalIssueCount}
        prCount={filteredPrs.length}
      >
        <ListContent
          activeTab={activeTab}
          activeSection={activeSection}
          data={filteredData}
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
    return (
      <div style={{ padding: "80px 20px 60px", textAlign: "center" }}>
        <h3 style={{ marginBottom: 8 }}>failed to load dashboard</h3>
        <p style={{ color: "var(--paper-ink-muted)", maxWidth: 320, margin: "0 auto" }}>
          <em>{message}</em>
        </p>
      </div>
    );
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
