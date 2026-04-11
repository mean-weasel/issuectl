import {
  getDb,
  getOctokit,
  getUnifiedList,
  listRepos,
  dbExists,
} from "@issuectl/core";
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";
import { List } from "@/components/list/List";

export const dynamic = "force-dynamic";

export default async function MainListPage() {
  // Preserve the existing first-run behavior: no DB, or no tracked repos,
  // falls back to the WelcomeScreen onboarding flow.
  if (!dbExists()) {
    return <WelcomeScreen />;
  }

  const db = getDb();
  if (listRepos(db).length === 0) {
    return <WelcomeScreen />;
  }

  const octokit = await getOctokit();
  const data = await getUnifiedList(db, octokit);

  return <List data={data} />;
}
