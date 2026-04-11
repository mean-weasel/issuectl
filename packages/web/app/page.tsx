import {
  getDb,
  getOctokit,
  getUnifiedList,
  listRepos,
  dbExists,
  checkGhAuth,
} from "@issuectl/core";
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";
import { List } from "@/components/list/List";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function MainListPage({ searchParams }: Props) {
  if (!dbExists()) {
    return <WelcomeScreen />;
  }

  const db = getDb();
  if (listRepos(db).length === 0) {
    return <WelcomeScreen />;
  }

  const { tab } = await searchParams;
  const activeTab = tab === "prs" ? "prs" : "issues";

  const octokit = await getOctokit();
  const data = await getUnifiedList(db, octokit);

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
      prCount={0}
      username={username}
    />
  );
}
