import { getDb, getOctokit, getDashboardData, dbExists } from "@issuectl/core";
import { PageHeader } from "@/components/ui/PageHeader";
import { RepoGrid } from "@/components/dashboard/RepoGrid";
import { CacheBar } from "@/components/dashboard/CacheBar";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Not initialized — show genuine empty state
  if (!dbExists()) {
    return (
      <>
        <PageHeader title="Getting Started" />
        <RepoGrid repos={[]} />
      </>
    );
  }

  const db = getDb();
  let data;

  try {
    const octokit = await getOctokit();
    data = await getDashboardData(db, octokit);
  } catch (err) {
    // Auth or API failure — log and show empty state with error context
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
