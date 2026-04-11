import type {
  Deployment,
  GitHubIssue,
  GitHubComment,
  GitHubPull,
  Priority,
} from "@issuectl/core";
import { Chip } from "@/components/paper";
import { DetailTopBar } from "./DetailTopBar";
import {
  DetailMeta,
  StateChip,
  MetaSeparator,
  MetaNum,
} from "./DetailMeta";
import { BodyText } from "./BodyText";
import { CommentList } from "./CommentList";
import { CommentComposer } from "./CommentComposer";
import { LaunchCard } from "./LaunchCard";
import { PriorityPicker } from "./PriorityPicker";
import styles from "./IssueDetail.module.css";

type Props = {
  owner: string;
  repoName: string;
  repoId: number;
  repoLocalPath: string | null;
  currentPriority: Priority;
  issue: GitHubIssue;
  comments: GitHubComment[];
  deployments: Deployment[];
  linkedPRs: GitHubPull[];
  referencedFiles: string[];
};

function formatAge(updatedAt: string): string {
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return "";
  const diffDays = Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
  if (diffDays < 1) return "today";
  if (diffDays === 1) return "1d old";
  return `${diffDays}d old`;
}

export function IssueDetail({
  owner,
  repoName,
  repoId,
  repoLocalPath,
  currentPriority,
  issue,
  comments,
  deployments,
  linkedPRs: _linkedPRs,
  referencedFiles,
}: Props) {
  const displayLabels = issue.labels.filter(
    (l) => !l.name.startsWith("issuectl:"),
  );

  return (
    <div className={styles.container}>
      <DetailTopBar
        backHref="/"
        crumb={
          <>
            {owner}/<b>{repoName}</b>
          </>
        }
        menu="···"
      />
      <div className={styles.body}>
        <h1 className={styles.title}>{issue.title}</h1>
        <DetailMeta>
          <Chip>{repoName}</Chip>
          <MetaNum>#{issue.number}</MetaNum>
          <MetaSeparator />
          <StateChip state={issue.state} />
          {displayLabels.length > 0 && (
            <>
              <MetaSeparator />
              {displayLabels.slice(0, 3).map((l) => (
                <span key={l.name}>{l.name}</span>
              ))}
            </>
          )}
          <MetaSeparator />
          <span>{formatAge(issue.updatedAt)}</span>
          <MetaSeparator />
          <PriorityPicker
            repoId={repoId}
            issueNumber={issue.number}
            currentPriority={currentPriority}
          />
        </DetailMeta>

        <LaunchCard
          owner={owner}
          repo={repoName}
          repoLocalPath={repoLocalPath}
          issue={issue}
          comments={comments}
          deployments={deployments}
          referencedFiles={referencedFiles}
        />
        <BodyText body={issue.body} />
        <CommentList comments={comments} />
        <CommentComposer
          owner={owner}
          repo={repoName}
          issueNumber={issue.number}
        />
      </div>
    </div>
  );
}
