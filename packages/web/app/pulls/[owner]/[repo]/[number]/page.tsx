import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDb, getDeploymentsForTarget, getOctokit, getPullDetail, getRepo, listLabels } from "@issuectl/core";
import { PrDetail } from "@/components/detail/PrDetail";
import { getWebhookAutomationHealth } from "@/lib/webhook-health";

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
  return { title: `PR #${number} — ${owner}/${repo} — issuectl` };
}

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
    const repoRecord = getRepo(db, owner, repo);
    const webhookHealth = await getWebhookAutomationHealth(db, repoRecord);
    const [detail, availableLabels] = await Promise.all([
      getPullDetail(db, octokit, owner, repo, pullNumber),
      listLabels(octokit, owner, repo),
    ]);
    const deployments = repoRecord
      ? getDeploymentsForTarget(db, repoRecord.id, "pr", pullNumber)
      : [];
    return (
      <PrDetail
        owner={owner}
        repoName={repo}
        pull={detail.pull}
        checks={detail.checks}
        files={detail.files}
        reviews={detail.reviews}
        linkedIssue={detail.linkedIssue}
        availableLabels={availableLabels}
        deployments={deployments}
        webhookHealth={webhookHealth}
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
      `[issuectl] PullDetailPage: unexpected error fetching ${owner}/${repo}#${pullNumber}`,
      err,
    );
    throw err instanceof Error ? new Error(err.message) : new Error(String(err));
  }
}
