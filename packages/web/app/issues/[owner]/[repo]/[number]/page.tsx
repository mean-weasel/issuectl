import { notFound } from "next/navigation";
import { getDb, getOctokit, getIssueDetail } from "@issuectl/core";
import { IssueDetail } from "@/components/detail/IssueDetail";

export const dynamic = "force-dynamic";

type Params = {
  owner: string;
  repo: string;
  number: string;
};

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { owner, repo, number } = await params;
  const issueNumber = Number(number);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    notFound();
  }

  const db = getDb();
  const octokit = await getOctokit();

  try {
    const detail = await getIssueDetail(db, octokit, owner, repo, issueNumber);
    return (
      <IssueDetail
        owner={owner}
        repoName={repo}
        issue={detail.issue}
        comments={detail.comments}
        deployments={detail.deployments}
        linkedPRs={detail.linkedPRs}
      />
    );
  } catch (err) {
    console.error(
      `[issuectl] IssueDetailPage: failed to fetch ${owner}/${repo}#${issueNumber}`,
      err,
    );
    notFound();
  }
}
