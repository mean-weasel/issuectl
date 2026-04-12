import { getDb, getOctokit, getIssueContent } from "@issuectl/core";
import type { Deployment, GitHubIssue } from "@issuectl/core";
import { LaunchCard } from "./LaunchCard";
import { CommentList } from "./CommentList";
import { CommentComposer } from "./CommentComposer";

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
 */
export async function IssueDetailContent({
  owner,
  repoName,
  repoLocalPath,
  issue,
  deployments,
  referencedFiles,
}: Props) {
  const db = getDb();
  const octokit = await getOctokit();
  const { comments } = await getIssueContent(db, octokit, owner, repoName, issue.number);

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
