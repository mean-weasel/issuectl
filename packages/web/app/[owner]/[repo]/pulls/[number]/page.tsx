import Link from "next/link";
import { getDb, getOctokit, getPullDetail, getComments } from "@issuectl/core";
import { PageHeader } from "@/components/ui/PageHeader";
import { IssueBody } from "@/components/issue/IssueBody";
import { PRStatRow } from "@/components/pr/PRStatRow";
import { PRSidebar } from "@/components/pr/PRSidebar";
import { PRStatusBadge } from "@/components/pr/PRStatusBadge";
import { CommentThread } from "@/components/issue/CommentThread";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ owner: string; repo: string; number: string }>;
};

export default async function PRDetailPage({ params }: Props) {
  const { owner, repo, number: numStr } = await params;
  const prNumber = parseInt(numStr, 10);

  if (Number.isNaN(prNumber) || prNumber < 1) {
    return <div className={styles.error}>Invalid PR number.</div>;
  }

  let data: Awaited<ReturnType<typeof getPullDetail>> | null = null;
  let comments: Awaited<ReturnType<typeof getComments>> | null = null;

  try {
    const db = getDb();
    const octokit = await getOctokit();
    [data, comments] = await Promise.all([
      getPullDetail(db, octokit, owner, repo, prNumber),
      getComments(db, octokit, owner, repo, prNumber),
    ]);
  } catch (err) {
    console.error(`[issuectl] Failed to load PR #${prNumber}:`, err);
  }

  if (!data || !comments) {
    return <div className={styles.error}>Failed to load pull request.</div>;
  }

  const { pull, checks, files, linkedIssue } = data;

  return (
    <>
      <PageHeader
        title={
          <span className={styles.pageTitle}>{pull.title}</span>
        }
        breadcrumb={
          <>
            <Link href="/">Dashboard</Link>
            <span>/</span>
            <Link href={`/${owner}/${repo}`}>{repo}</Link>
            <span>/</span>
            <span>PR #{prNumber}</span>
          </>
        }
        actions={
          <PRStatusBadge pull={pull} />
        }
      />
      <div className={styles.detailView}>
        <div className={styles.main}>
          <PRStatRow pull={pull} />
          <IssueBody body={pull.body} />
          <CommentThread
            comments={comments.comments}
            owner={owner}
            repo={repo}
            issueNumber={prNumber}
            title="Review"
          />
        </div>
        <PRSidebar
          checks={checks}
          files={files}
          linkedIssue={linkedIssue}
          headRef={pull.headRef}
          owner={owner}
          repo={repo}
        />
      </div>
    </>
  );
}
