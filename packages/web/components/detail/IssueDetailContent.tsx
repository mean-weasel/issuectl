import { getDb, getOctokit, getIssueContent } from "@issuectl/core";
import type { Deployment, GitHubIssue } from "@issuectl/core";
import { LaunchCard } from "./LaunchCard";
import { CommentList } from "./CommentList";
import { CommentComposer } from "./CommentComposer";
import styles from "./IssueDetail.module.css";

type Props = {
  owner: string;
  repoName: string;
  repoLocalPath: string | null;
  issue: GitHubIssue;
  deployments: Deployment[];
  referencedFiles: string[];
};

/**
 * Streaming content section: fetches comments + linked PRs, then renders
 * the LaunchCard (which consumes comments for the launch modal), the
 * comment list, and the comment composer. Wrapped in Suspense by the page.
 *
 * Handles errors inline so a transient failure in fetchComments/findLinkedPRs
 * shows a degraded state instead of tearing down the whole page via the
 * root error boundary.
 */
export async function IssueDetailContent({
  owner,
  repoName,
  repoLocalPath,
  issue,
  deployments,
  referencedFiles,
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
          repoLocalPath={repoLocalPath}
          issue={issue}
          comments={[]}
          deployments={deployments}
          referencedFiles={referencedFiles}
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
        repoLocalPath={repoLocalPath}
        issue={issue}
        comments={comments}
        deployments={deployments}
        referencedFiles={referencedFiles}
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
