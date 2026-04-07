import { Suspense } from "react";
import {
  getDb,
  getOctokit,
  getIssues,
  getPulls,
  listRepos,
  listLabels,
  type GitHubLabel,
} from "@issuectl/core";
import { RepoHeader } from "@/components/repo/RepoHeader";
import { TabBar } from "@/components/repo/TabBar";
import { IssuesTable } from "@/components/repo/IssuesTable";
import { PullsTable } from "@/components/repo/PullsTable";
import { NewIssueButton } from "@/components/issue/NewIssueButton";

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
  let labels: GitHubLabel[] = [];

  const db = getDb();
  const repos = listRepos(db).map((r) => ({ owner: r.owner, repo: r.name }));

  try {
    const octokit = await getOctokit();
    const [issueResult, pullResult, repoLabels] = await Promise.all([
      getIssues(db, octokit, owner, repo),
      getPulls(db, octokit, owner, repo),
      listLabels(octokit, owner, repo),
    ]);
    issues = issueResult.issues;
    pulls = pullResult.pulls;
    labels = repoLabels;
  } catch (err) {
    console.error(`[issuectl] Failed to load data for ${owner}/${repo}:`, err);
  }

  return (
    <>
      <RepoHeader
        owner={owner}
        repo={repo}
        actions={
          <NewIssueButton
            repos={repos}
            currentRepo={{ owner, repo }}
            availableLabels={labels}
          />
        }
      />
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
