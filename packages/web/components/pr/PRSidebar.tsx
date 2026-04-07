import type { GitHubCheck, GitHubIssue, GitHubPullFile } from "@issuectl/core";
import { CIChecks } from "./CIChecks";
import { LinkedIssueCard } from "./LinkedIssueCard";
import { FilesChanged } from "./FilesChanged";
import styles from "./PRSidebar.module.css";

type Props = {
  checks: GitHubCheck[];
  files: GitHubPullFile[];
  linkedIssue: GitHubIssue | null;
  headRef: string;
  owner: string;
  repo: string;
};

export function PRSidebar({ checks, files, linkedIssue, headRef, owner, repo }: Props) {
  return (
    <div className={styles.sidebar}>
      <CIChecks checks={checks} />
      {linkedIssue && (
        <LinkedIssueCard issue={linkedIssue} owner={owner} repo={repo} />
      )}
      <div className={styles.card}>
        <span className={styles.title}>Branch</span>
        <div className={styles.branchName}>{headRef}</div>
      </div>
      <FilesChanged files={files} />
    </div>
  );
}
