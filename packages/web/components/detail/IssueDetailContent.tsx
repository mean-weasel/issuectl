import { getDb, getOctokit, getIssueContent } from "@issuectl/core";
import type { Deployment, GitHubIssue } from "@issuectl/core";
import { LaunchCard } from "./LaunchCard";
import { CommentList } from "./CommentList";
import { CommentComposer } from "./CommentComposer";
import styles from "./IssueDetail.module.css";

type Props = {
  owner: string;
  repoName: string;
  issue: GitHubIssue;
  deployments: Deployment[];
};

/**
 * Streaming content section: calls getIssueContent to fetch comments,
 * then renders the LaunchCard (active deployment banner only), the
 * comment list, and the comment composer. Wrapped in Suspense by the page.
 *
 * Handles errors inline so a transient failure in getIssueContent
 * shows a degraded state instead of tearing down the whole page via the
 * root error boundary.
 */
export async function IssueDetailContent({
  owner,
  repoName,
  issue,
  deployments,
}: Props) {
  let comments;
  try {
    const db = getDb();
    const octokit = await getOctokit();
    const result = await getIssueContent(db, octokit, owner, repoName, issue.number);
    comments = result.comments;
  } catch (err) {
    console.error(
      `[issuectl] IssueDetailContent: failed to load comments for ${owner}/${repoName}#${issue.number}`,
      err,
    );
    return (
      <>
        <LaunchCard
          owner={owner}
          repo={repoName}
          issueNumber={issue.number}
          issueTitle={issue.title}
          deployments={deployments}
        />
        <div className={styles.contentError} role="alert">
          Could not load comments. Refresh to try again.
        </div>
      </>
    );
  }

  return (
    <>
      <LaunchCard
        owner={owner}
        repo={repoName}
        issueNumber={issue.number}
        issueTitle={issue.title}
        deployments={deployments}
      />
      <CommentList comments={comments} />
      <CommentComposer
        owner={owner}
        repo={repoName}
        issueNumber={issue.number}
      />
    </>
  );
}
