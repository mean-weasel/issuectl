import Link from "next/link";
import {
  getDb,
  getDeploymentById,
  getIssueDetail,
  getOctokit,
} from "@issuectl/core";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { LaunchActiveBanner } from "@/components/launch/LaunchActiveBanner";
import { LaunchProgress } from "@/components/launch/LaunchProgress";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ owner: string; repo: string; number: string }>;
  searchParams: Promise<{ deploymentId?: string }>;
};

export default async function LaunchActivePage({
  params,
  searchParams,
}: Props) {
  const { owner, repo, number: numStr } = await params;
  const { deploymentId: depIdStr } = await searchParams;
  const issueNumber = parseInt(numStr, 10);
  const deploymentId = depIdStr ? parseInt(depIdStr, 10) : null;

  if (Number.isNaN(issueNumber) || issueNumber < 1) {
    return <div className={styles.error}>Invalid issue number.</div>;
  }

  const db = getDb();

  const deployment =
    deploymentId && !Number.isNaN(deploymentId)
      ? getDeploymentById(db, deploymentId)
      : undefined;

  if (!deployment) {
    return <div className={styles.error}>Deployment not found.</div>;
  }

  let commentCount = 0;
  let fileCount = 0;
  try {
    const octokit = await getOctokit();
    const detail = await getIssueDetail(
      db,
      octokit,
      owner,
      repo,
      issueNumber,
    );
    commentCount = detail.comments.length;
    fileCount = detail.referencedFiles.length;
  } catch (err) {
    console.error(
      `[issuectl] Failed to load issue detail for #${issueNumber} on launch page:`,
      err,
    );
  }

  return (
    <>
      <PageHeader
        title={
          <span className={styles.pageTitle}>
            Launching <span className={styles.accent}>#{issueNumber}</span> to
            Claude Code
          </span>
        }
        breadcrumb={
          <>
            <Link href="/">Dashboard</Link>
            <span>/</span>
            <Link href={`/${owner}/${repo}`}>{repo}</Link>
            <span>/</span>
            <Link href={`/${owner}/${repo}/issues/${issueNumber}`}>
              #{issueNumber}
            </Link>
            <span>/</span>
            <span>Launching</span>
          </>
        }
      />
      <div className={styles.content}>
        <LaunchActiveBanner
          deploymentId={deployment.id}
          branchName={deployment.branchName}
          endedAt={deployment.endedAt}
          owner={owner}
          repo={repo}
          issueNumber={issueNumber}
        />

        <LaunchProgress
          deployment={deployment}
          commentCount={commentCount}
          fileCount={fileCount}
        />

        <div className={styles.actions}>
          <Link href={`/${owner}/${repo}/issues/${issueNumber}`}>
            <Button variant="secondary">Back to issue</Button>
          </Link>
          <Link href={`/${owner}/${repo}`}>
            <Button variant="secondary">Back to {repo}</Button>
          </Link>
        </div>
      </div>
    </>
  );
}
