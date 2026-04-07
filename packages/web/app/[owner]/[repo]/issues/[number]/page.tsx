import Link from "next/link";
import {
  getDb,
  getOctokit,
  getIssueDetail,
  getRepo,
  listLabels,
  type GitHubLabel,
} from "@issuectl/core";
import { PageHeader } from "@/components/ui/PageHeader";
import { IssueDetailClient } from "@/components/issue/IssueDetailClient";
import { CommentThread } from "@/components/issue/CommentThread";
import { IssueSidebar } from "@/components/issue/IssueSidebar";
import { CloseIssueButton } from "@/components/issue/CloseIssueButton";
import { LaunchButton } from "@/components/launch/LaunchButton";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ owner: string; repo: string; number: string }>;
};

export default async function IssueDetailPage({ params }: Props) {
  const { owner, repo, number: numStr } = await params;
  const issueNumber = parseInt(numStr, 10);

  if (Number.isNaN(issueNumber) || issueNumber < 1) {
    return <div className={styles.error}>Invalid issue number.</div>;
  }

  const db = getDb();
  let data: Awaited<ReturnType<typeof getIssueDetail>> | null = null;
  let availableLabels: GitHubLabel[] = [];

  try {
    const octokit = await getOctokit();
    data = await getIssueDetail(db, octokit, owner, repo, issueNumber);

    // Labels are supplementary — fetch separately so a failure doesn't break the page
    try {
      availableLabels = await listLabels(octokit, owner, repo);
    } catch (labelErr) {
      console.warn(`[issuectl] Failed to load labels for ${owner}/${repo}:`, labelErr);
    }
  } catch (err) {
    console.error(
      `[issuectl] Failed to load issue #${issueNumber}:`,
      err,
    );
  }

  if (!data) {
    return <div className={styles.error}>Failed to load issue.</div>;
  }

  const { issue, comments, deployments, linkedPRs, referencedFiles } = data;

  const repoRecord = getRepo(db, owner, repo);
  const repoLocalPath = repoRecord?.localPath ?? null;

  return (
    <>
      <PageHeader
        title={
          <span className={styles.pageTitle}>{issue.title}</span>
        }
        breadcrumb={
          <>
            <Link href="/">Dashboard</Link>
            <span>/</span>
            <Link href={`/${owner}/${repo}`}>{repo}</Link>
            <span>/</span>
            <span>#{issueNumber}</span>
          </>
        }
        actions={
          <>
            <CloseIssueButton
              owner={owner}
              repo={repo}
              number={issueNumber}
              isClosed={issue.state === "closed"}
            />
            <LaunchButton
              owner={owner}
              repo={repo}
              repoLocalPath={repoLocalPath}
              issue={issue}
              comments={comments}
              deployments={deployments}
              referencedFiles={referencedFiles}
            />
          </>
        }
      />
      <div className={styles.detailView}>
        <div className={styles.main}>
          <IssueDetailClient
            owner={owner}
            repo={repo}
            issue={issue}
          />
          <CommentThread
            comments={comments}
            owner={owner}
            repo={repo}
            issueNumber={issueNumber}
          />
        </div>
        <IssueSidebar
          issue={issue}
          comments={comments}
          deployments={deployments}
          linkedPRs={linkedPRs}
          referencedFiles={referencedFiles}
          owner={owner}
          repo={repo}
          repoLocalPath={repoLocalPath}
          availableLabels={availableLabels}
        />
      </div>
    </>
  );
}
