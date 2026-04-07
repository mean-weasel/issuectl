import type { Deployment, GitHubIssue } from "@issuectl/core";
import { Button } from "@/components/ui/Button";
import styles from "./LaunchCard.module.css";

type Props = {
  issue: GitHubIssue;
  commentCount: number;
  deployments: Deployment[];
  referencedFiles: string[];
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function LaunchCard({
  issue,
  commentCount,
  deployments,
  referencedFiles,
}: Props) {
  const lastDeployment = deployments[0];
  const branch =
    lastDeployment?.branchName ??
    `issue-${issue.number}-${slugify(issue.title)}`;
  const hasLaunched = deployments.length > 0;

  return (
    <div className={styles.card}>
      <div className={styles.title}>Launch to Claude Code</div>
      <div className={styles.meta}>
        branch: <span className={styles.value}>{branch}</span>
      </div>
      <div className={styles.meta}>
        context:{" "}
        <span className={styles.value}>
          issue + {commentCount} comment{commentCount !== 1 ? "s" : ""} +{" "}
          {referencedFiles.length} file{referencedFiles.length !== 1 ? "s" : ""}
        </span>
      </div>
      <Button variant="launch" className={styles.launchBtn}>
        {hasLaunched ? "Re-launch" : "Launch"}
      </Button>
    </div>
  );
}
