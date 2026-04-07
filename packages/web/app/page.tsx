import { getDb, getOctokit, getDashboardData } from "@issuectl/core";
import { PageHeader } from "@/components/ui/PageHeader";
import { RepoGrid } from "@/components/dashboard/RepoGrid";
import { CacheBar } from "@/components/dashboard/CacheBar";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let data;

  try {
    const db = getDb();
    const octokit = await getOctokit();
    data = await getDashboardData(db, octokit);
  } catch (err) {
    // DB or auth may not be initialized — show empty state
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
