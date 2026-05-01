import type {
  GitHubIssue,
  GitHubComment,
  GitHubPull,
  GitHubLabel,
  Deployment,
} from "@issuectl/core";
import type { LaunchAgent } from "@/components/launch/agent";
import { LaunchCard } from "./LaunchCard";
import { LabelManager } from "./LabelManager";
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
  availableLabels?: GitHubLabel[];
  defaultAgent?: LaunchAgent;
};

export function IssueSidebar({
  issue,
  comments,
  deployments,
  linkedPRs,
  referencedFiles,
  owner,
  repo,
  repoLocalPath,
  availableLabels = [],
  defaultAgent = "claude",
}: Props) {
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
        defaultAgent={defaultAgent}
      />
      <div className={styles.card}>
        <LabelManager
          owner={owner}
          repo={repo}
          issueNumber={issue.number}
          currentLabels={issue.labels}
          availableLabels={availableLabels}
        />
      </div>
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
