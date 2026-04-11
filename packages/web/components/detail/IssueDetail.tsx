import type {
  Deployment,
  GitHubIssue,
  GitHubComment,
  GitHubPull,
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
import { LaunchCardPlaceholder } from "./LaunchCardPlaceholder";
import styles from "./IssueDetail.module.css";

type Props = {
  owner: string;
  repoName: string;
  issue: GitHubIssue;
  comments: GitHubComment[];
  deployments: Deployment[];
  linkedPRs: GitHubPull[];
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
  issue,
  comments,
  deployments: _deployments,
  linkedPRs: _linkedPRs,
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
        </DetailMeta>

        <LaunchCardPlaceholder />
        <BodyText body={issue.body} />
        <CommentList comments={comments} />
      </div>
    </div>
  );
}
