import type {
  GitHubIssue,
  GitHubComment,
  GitHubPull,
  GitHubLabel,
  Deployment,
} from "@issuectl/core";
import { Badge } from "@/components/ui/Badge";
import { LaunchCard } from "./LaunchCard";
import { DeploymentTimeline } from "./DeploymentTimeline";
import { ReferencedFiles } from "./ReferencedFiles";
import { IssueDetails } from "./IssueDetails";
import styles from "./IssueSidebar.module.css";

type Props = {
  issue: GitHubIssue;
  comments: GitHubComment[];
  deployments: Deployment[];
  linkedPRs: GitHubPull[];
  referencedFiles: string[];
  owner: string;
  repo: string;
  repoLocalPath: string | null;
};

function getDisplayLabels(labels: GitHubLabel[]): GitHubLabel[] {
  return labels.filter(
    (l) =>
      l.name.toLowerCase() === "bug" ||
      l.name.toLowerCase() === "enhancement" ||
      l.name.startsWith("issuectl:"),
  );
}

export function IssueSidebar({
  issue,
  comments,
  deployments,
  linkedPRs,
  referencedFiles,
  owner,
  repo,
  repoLocalPath,
}: Props) {
  const displayLabels = getDisplayLabels(issue.labels);

  return (
    <div className={styles.sidebar}>
      <LaunchCard
        owner={owner}
        repo={repo}
        repoLocalPath={repoLocalPath}
        issue={issue}
        comments={comments}
        deployments={deployments}
        referencedFiles={referencedFiles}
      />
      {displayLabels.length > 0 && (
        <div className={styles.card}>
          <span className={styles.title}>Lifecycle</span>
          <div className={styles.labels}>
            {displayLabels.map((l) => (
              <Badge key={l.name} label={l.name} color={l.color} />
            ))}
          </div>
        </div>
      )}
      <DeploymentTimeline deployments={deployments} linkedPRs={linkedPRs} />
      <ReferencedFiles files={referencedFiles} />
      <IssueDetails
        issue={issue}
        owner={owner}
        repo={repo}
        linkedPRs={linkedPRs}
      />
    </div>
  );
}
