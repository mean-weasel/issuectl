import { notFound } from "next/navigation";
import { getDb, getOctokit, getPullDetail } from "@issuectl/core";
import { PrDetail } from "@/components/detail/PrDetail";

export const dynamic = "force-dynamic";

type Params = {
  owner: string;
  repo: string;
  number: string;
};

export default async function PullDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { owner, repo, number } = await params;
  const pullNumber = Number(number);
  if (!Number.isInteger(pullNumber) || pullNumber <= 0) {
    notFound();
  }

  const db = getDb();
  const octokit = await getOctokit();

  try {
    const detail = await getPullDetail(db, octokit, owner, repo, pullNumber);
    return (
      <PrDetail
        owner={owner}
        repoName={repo}
        pull={detail.pull}
        checks={detail.checks}
        files={detail.files}
        linkedIssue={detail.linkedIssue}
      />
    );
  } catch (err) {
    console.error(
      `[issuectl] PullDetailPage: failed to fetch ${owner}/${repo}#${pullNumber}`,
      err,
    );
    notFound();
  }
}
