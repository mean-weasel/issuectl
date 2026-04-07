import { getDb, getOctokit, getDashboardData, dbExists, listRepos } from "@issuectl/core";
import { PageHeader } from "@/components/ui/PageHeader";
import { RepoGrid } from "@/components/dashboard/RepoGrid";
import { CacheBar } from "@/components/dashboard/CacheBar";
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!dbExists()) {
    return <WelcomeScreen />;
  }

  const db = getDb();

  // Distinguish "no repos configured" from "API failure" — the catch block
  // below also produces repos: [], which would incorrectly show WelcomeScreen
  if (listRepos(db).length === 0) {
    return <WelcomeScreen />;
  }

  let data;

  try {
    const octokit = await getOctokit();
    data = await getDashboardData(db, octokit);
  } catch (err) {
    console.error("[issuectl] Dashboard data fetch failed:", err);
    data = { repos: [], totalIssues: 0, totalPRs: 0, cachedAt: null };
  }

  return (
    <>
      <PageHeader
        title={
          <>
            <span style={{ color: "var(--accent)" }}>{data.repos.length}</span>{" "}
            {data.repos.length === 1 ? "Repository" : "Repositories"}
          </>
        }
      />
      <CacheBar
        cachedAt={data.cachedAt?.toISOString() ?? null}
        totalIssues={data.totalIssues}
        totalPRs={data.totalPRs}
      />
      <RepoGrid repos={data.repos} />
    </>
  );
}
