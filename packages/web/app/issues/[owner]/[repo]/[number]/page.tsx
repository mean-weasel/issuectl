import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getDb,
  getOctokit,
  getIssueHeader,
  getRepo,
  getPriority,
} from "@issuectl/core";
import { IssueDetail } from "@/components/detail/IssueDetail";
import { IssueDetailContent } from "@/components/detail/IssueDetailContent";
import styles from "./loading.module.css";

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

function ContentSkeleton() {
  return (
    <>
      <div className={styles.bodyBlock} />
      <div className={styles.commentBlock} />
      <div className={styles.commentBlock} />
    </>
  );
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
    const { issue, deployments, referencedFiles } = await getIssueHeader(
      db,
      octokit,
      owner,
      repo,
      issueNumber,
    );
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
        currentPriority={currentPriority}
        issue={issue}
      >
        <Suspense fallback={<ContentSkeleton />}>
          <IssueDetailContent
            owner={owner}
            repoName={repo}
            repoLocalPath={repoRecord?.localPath ?? null}
            issue={issue}
            deployments={deployments}
            referencedFiles={referencedFiles}
          />
        </Suspense>
      </IssueDetail>
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
