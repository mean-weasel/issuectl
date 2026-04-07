import Link from "next/link";
import { getDb, getOctokit, getIssueDetail } from "@issuectl/core";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { IssueBody } from "@/components/issue/IssueBody";
import { CommentThread } from "@/components/issue/CommentThread";
import { IssueSidebar } from "@/components/issue/IssueSidebar";
import { CloseIssueButton } from "@/components/issue/CloseIssueButton";
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

  let data: Awaited<ReturnType<typeof getIssueDetail>> | null = null;

  try {
    const db = getDb();
    const octokit = await getOctokit();
    data = await getIssueDetail(db, octokit, owner, repo, issueNumber);
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
            <Button variant="secondary" disabled>
              Edit
            </Button>
            <CloseIssueButton
              owner={owner}
              repo={repo}
              number={issueNumber}
              isClosed={issue.state === "closed"}
            />
            <Button variant="launch">
              {deployments.length > 0 ? "Re-launch" : "Launch to Claude Code"}
            </Button>
          </>
        }
      />
      <div className={styles.detailView}>
        <div className={styles.main}>
          <IssueBody body={issue.body} />
          <CommentThread
            comments={comments}
            owner={owner}
            repo={repo}
            issueNumber={issueNumber}
          />
        </div>
        <IssueSidebar
          issue={issue}
          commentCount={comments.length}
          deployments={deployments}
          linkedPRs={linkedPRs}
          referencedFiles={referencedFiles}
          owner={owner}
          repo={repo}
        />
      </div>
    </>
  );
}
