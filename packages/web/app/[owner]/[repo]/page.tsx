import { Suspense } from "react";
import { getDb, getOctokit, getIssues, getPulls } from "@issuectl/core";
import { RepoHeader } from "@/components/repo/RepoHeader";
import { TabBar } from "@/components/repo/TabBar";
import { IssuesTable } from "@/components/repo/IssuesTable";
import { PullsTable } from "@/components/repo/PullsTable";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function RepoDetailPage({ params, searchParams }: Props) {
  const { owner, repo } = await params;
  const { tab } = await searchParams;
  const activeTab = tab === "prs" ? "prs" : "issues";

  let issues: Awaited<ReturnType<typeof getIssues>>["issues"] = [];
  let pulls: Awaited<ReturnType<typeof getPulls>>["pulls"] = [];

  try {
    const db = getDb();
    const octokit = await getOctokit();
    const [issueResult, pullResult] = await Promise.all([
      getIssues(db, octokit, owner, repo),
      getPulls(db, octokit, owner, repo),
    ]);
    issues = issueResult.issues;
    pulls = pullResult.pulls;
  } catch (err) {
    console.error(`[issuectl] Failed to load data for ${owner}/${repo}:`, err);
  }

  return (
    <>
      <RepoHeader owner={owner} repo={repo} />
      <Suspense>
        <TabBar issueCount={issues.length} prCount={pulls.length} />
      </Suspense>
      {activeTab === "issues" ? (
        <IssuesTable issues={issues} owner={owner} repo={repo} />
      ) : (
        <PullsTable pulls={pulls} owner={owner} repo={repo} />
      )}
    </>
  );
}
