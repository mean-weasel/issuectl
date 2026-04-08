import { getDb, getOctokit, getDashboardData, getCacheTtl, dbExists, listRepos } from "@issuectl/core";
import { PageHeader } from "@/components/ui/PageHeader";
import { RepoGrid } from "@/components/dashboard/RepoGrid";
import { DashboardCacheStatus } from "@/components/dashboard/DashboardCacheStatus";
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!dbExists()) {
    return <WelcomeScreen />;
  }

  const db = getDb();

  // Guard before the try/catch: the catch fallback also produces repos: [],
  // which would incorrectly show WelcomeScreen on a transient API failure.
  if (listRepos(db).length === 0) {
    return <WelcomeScreen />;
  }

  const octokit = await getOctokit();
  const data = await getDashboardData(db, octokit);

  const cachedAtIso = data.cachedAt?.toISOString() ?? null;
  const ttl = getCacheTtl(db);
  const isStale = data.cachedAt
    ? Date.now() - data.cachedAt.getTime() > ttl * 1000
    : false;

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
      <DashboardCacheStatus
        cachedAt={cachedAtIso}
        totalIssues={data.totalIssues}
        totalPRs={data.totalPRs}
        isStale={isStale}
      />
      <RepoGrid repos={data.repos} />
    </>
  );
}
