import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getDb,
  getOctokit,
  getIssueDetail,
  getRepo,
  getPriority,
} from "@issuectl/core";
import { IssueDetail } from "@/components/detail/IssueDetail";

export const dynamic = "force-dynamic";

type Params = {
  owner: string;
  repo: string;
  number: string;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { owner, repo, number } = await params;
  return { title: `#${number} — ${owner}/${repo} — issuectl` };
}

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
    const repoRecord = getRepo(db, owner, repo);
    const repoId = repoRecord?.id ?? 0;
    const currentPriority = repoId > 0
      ? getPriority(db, repoId, issueNumber)
      : "normal";

    return (
      <IssueDetail
        owner={owner}
        repoName={repo}
        repoId={repoId}
        repoLocalPath={repoRecord?.localPath ?? null}
        currentPriority={currentPriority}
        issue={detail.issue}
        comments={detail.comments}
        deployments={detail.deployments}
        linkedPRs={detail.linkedPRs}
        referencedFiles={detail.referencedFiles}
      />
    );
  } catch (err) {
    const status = err !== null && err !== undefined && typeof err === "object" && "status" in err
      ? (err as { status: number }).status
      : undefined;
    if (status === 404 || status === 410) {
      notFound();
    }
    console.error(
      `[issuectl] IssueDetailPage: unexpected error fetching ${owner}/${repo}#${issueNumber}`,
      err,
    );
    throw err instanceof Error ? new Error(err.message) : new Error(String(err));
  }
}
