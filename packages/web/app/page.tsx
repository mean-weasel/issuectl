import {
  getDb,
  getOctokit,
  getUnifiedList,
  getPulls,
  listRepos,
  dbExists,
  type GitHubPull,
  type Section,
} from "@issuectl/core";
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";
import { List } from "@/components/list/List";
import { getAuthStatus } from "@/lib/auth";
import {
  filterPrs,
  filterUnifiedList,
  resolveActiveRepo,
  type PrEntry,
} from "@/lib/page-filters";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    tab?: string;
    repo?: string;
    mine?: string;
    section?: string;
  }>;
};

const SECTIONS: readonly Section[] = [
  "unassigned",
  "in_focus",
  "in_flight",
  "shipped",
];

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
  } = await searchParams;
  const activeTab = tab === "prs" ? "prs" : "issues";
  const activeRepo = resolveActiveRepo(repoParam, repos);
  const mineOnly = mineParam === "1";
  const activeSection: Section = (SECTIONS as readonly string[]).includes(
    sectionParam ?? "",
  )
    ? (sectionParam as Section)
    : "in_focus";

  const [octokit, auth] = await Promise.all([getOctokit(), getAuthStatus()]);

  const [data, allPrs] = await Promise.all([
    getUnifiedList(db, octokit),
    gatherPulls(db, octokit, repos),
  ]);

  const username = auth.authenticated ? auth.username : null;
  const filteredData = filterUnifiedList(data, activeRepo);
  const filteredPrs = filterPrs(allPrs, activeRepo, mineOnly ? username : null);

  return (
    <List
      data={filteredData}
      activeTab={activeTab}
      activeSection={activeSection}
      prs={filteredPrs}
      prCount={filteredPrs.length}
      username={username}
      repos={repos.map((r) => ({ owner: r.owner, name: r.name }))}
      activeRepo={activeRepo}
      mineOnly={mineOnly}
    />
  );
}

async function gatherPulls(
  db: ReturnType<typeof getDb>,
  octokit: Awaited<ReturnType<typeof getOctokit>>,
  repos: ReturnType<typeof listRepos>,
): Promise<PrEntry[]> {
  try {
    const prResults = await Promise.all(
      repos.map(async (repo) => {
        try {
          const { pulls } = await getPulls(db, octokit, repo.owner, repo.name);
          return pulls.map((pull) => ({
            repo: { owner: repo.owner, name: repo.name },
            pull,
          }));
        } catch (err) {
          console.warn(
            `[issuectl] getPulls failed for ${repo.owner}/${repo.name}:`,
            err instanceof Error ? err.message : err,
          );
          return [];
        }
      }),
    );
    return prResults.flat();
  } catch (err) {
    console.error("[issuectl] PR gather failed:", err);
    return [];
  }
}
