import {
  getDb,
  getOctokit,
  getUnifiedList,
  getPulls,
  listRepos,
  dbExists,
  type GitHubPull,
} from "@issuectl/core";
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";
import { List } from "@/components/list/List";
import { getAuthStatus } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

type PrEntry = { repo: { owner: string; name: string }; pull: GitHubPull };

export default async function MainListPage({ searchParams }: Props) {
  if (!dbExists()) {
    return <WelcomeScreen />;
  }

  const db = getDb();
  const repos = listRepos(db);
  if (repos.length === 0) {
    return <WelcomeScreen />;
  }

  const { tab } = await searchParams;
  const activeTab = tab === "prs" ? "prs" : "issues";

  // Auth check doesn't depend on octokit, so start it in parallel with the
  // octokit handshake. Then fan out data fetches in parallel once octokit is ready.
  const [octokit, auth] = await Promise.all([getOctokit(), getAuthStatus()]);

  const [data, allPrs] = await Promise.all([
    getUnifiedList(db, octokit),
    gatherPulls(db, octokit, repos),
  ]);

  const username = auth.authenticated ? auth.username : null;

  return (
    <List
      data={data}
      activeTab={activeTab}
      prs={allPrs}
      prCount={allPrs.length}
      username={username}
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
