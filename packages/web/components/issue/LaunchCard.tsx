import type {
  Deployment,
  GitHubIssue,
  GitHubComment,
} from "@issuectl/core";
import { generateBranchName } from "@/lib/branch";
import { DEFAULT_BRANCH_PATTERN } from "@/lib/constants";
import { LaunchButton } from "@/components/launch/LaunchButton";
import styles from "./LaunchCard.module.css";

type Props = {
  owner: string;
  repo: string;
  repoLocalPath: string | null;
  issue: GitHubIssue;
  comments: GitHubComment[];
  deployments: Deployment[];
  referencedFiles: string[];
};

export function LaunchCard({
  owner,
  repo,
  repoLocalPath,
  issue,
  comments,
  deployments,
  referencedFiles,
}: Props) {
  const lastDeployment = deployments[0];
  const branch =
    lastDeployment?.branchName ??
    generateBranchName(DEFAULT_BRANCH_PATTERN, issue.number, issue.title);

  return (
    <div className={styles.card}>
      <div className={styles.title}>Launch to Claude Code</div>
      <div className={styles.meta}>
        branch: <span className={styles.value}>{branch}</span>
      </div>
      <div className={styles.meta}>
        context:{" "}
        <span className={styles.value}>
          issue + {comments.length} comment{comments.length !== 1 ? "s" : ""} +{" "}
          {referencedFiles.length} file{referencedFiles.length !== 1 ? "s" : ""}
        </span>
      </div>
      <LaunchButton
        owner={owner}
        repo={repo}
        repoLocalPath={repoLocalPath}
        issue={issue}
        comments={comments}
        deployments={deployments}
        referencedFiles={referencedFiles}
        className={styles.launchBtn}
      />
    </div>
  );
}
