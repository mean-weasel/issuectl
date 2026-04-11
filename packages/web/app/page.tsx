import {
  getDb,
  getOctokit,
  getUnifiedList,
  getPulls,
  listRepos,
  dbExists,
  checkGhAuth,
  type GitHubPull,
} from "@issuectl/core";
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";
import { List } from "@/components/list/List";

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

  const octokit = await getOctokit();
  const data = await getUnifiedList(db, octokit);

  // Fetch PRs across all repos (non-fatal — PR tab degrades gracefully).
  let allPrs: PrEntry[] = [];
  try {
    const prResults = await Promise.all(
      repos.map(async (repo) => {
        try {
          const { pulls } = await getPulls(db, octokit, repo.owner, repo.name);
          return pulls.map((pull) => ({
            repo: { owner: repo.owner, name: repo.name },
            pull,
          }));
        } catch {
          return [];
        }
      }),
    );
    allPrs = prResults.flat();
  } catch {
    // Non-fatal — PR tab shows empty state.
  }

  // Get the authenticated username for the nav drawer footer.
  let username: string | null = null;
  try {
    const auth = await checkGhAuth();
    username = auth.username ?? null;
  } catch {
    // Non-fatal — the drawer just won't show the username.
  }

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
