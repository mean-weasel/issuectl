import { getDb, getOctokit, getIssueContent, getCurrentUserLogin } from "@issuectl/core";
import type { Deployment, GitHubIssue } from "@issuectl/core";
import { LaunchCard } from "./LaunchCard";
import { CommentSection } from "./CommentSection";
import styles from "./IssueDetail.module.css";

type Props = {
  owner: string;
  repoName: string;
  issue: GitHubIssue;
  deployments: Deployment[];
};

/**
 * Streaming content section: calls getIssueContent and getCurrentUserLogin
 * in parallel to fetch comments and identify the authenticated user,
 * then renders the LaunchCard and CommentSection (comment list with
 * inline edit/delete for own comments + composer). Wrapped in Suspense.
 *
 * Handles errors inline so a transient failure shows a degraded state
 * instead of tearing down the whole page. getCurrentUserLogin failures
 * are caught independently — comments still render, but edit/delete
 * buttons are hidden.
 */
export async function IssueDetailContent({
  owner,
  repoName,
  issue,
  deployments,
}: Props) {
  let comments;
  let currentUser: string | null;
  try {
    const db = getDb();
    const octokit = await getOctokit();
    const [result, login] = await Promise.all([
      getIssueContent(db, octokit, owner, repoName, issue.number),
      getCurrentUserLogin(db, octokit).catch((err) => {
        console.warn("[issuectl] Failed to fetch current user:", err);
        return null;
      }),
    ]);
    comments = result.comments;
    currentUser = login;
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
      <CommentSection
        initialComments={comments}
        currentUser={currentUser}
        owner={owner}
        repo={repoName}
        issueNumber={issue.number}
      />
    </>
  );
}
