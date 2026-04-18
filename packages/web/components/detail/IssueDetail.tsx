import type { ReactNode } from "react";
import type { GitHubIssue, Priority } from "@issuectl/core";
import { Chip } from "@/components/paper";
import { timeAgo } from "@/lib/format";
import { DetailTopBar } from "./DetailTopBar";
import {
  DetailMeta,
  StateChip,
  MetaSeparator,
  MetaNum,
} from "./DetailMeta";
import { BodyText } from "./BodyText";
import { PriorityPicker } from "./PriorityPicker";
import { IssueActionSheet } from "./IssueActionSheet";
import styles from "./IssueDetail.module.css";

type Props = {
  owner: string;
  repoName: string;
  repoId: number;
  currentPriority: Priority;
  issue: GitHubIssue;
  /** Rendered after the body — used by the page to stream launch/comments. */
  children?: ReactNode;
};

export function IssueDetail({
  owner,
  repoName,
  repoId,
  currentPriority,
  issue,
  children,
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
          <span>{timeAgo(issue.updatedAt)}</span>
          <MetaSeparator />
          <PriorityPicker
            repoId={repoId}
            issueNumber={issue.number}
            currentPriority={currentPriority}
          />
        </DetailMeta>

        <BodyText body={issue.body} />
        {children}
      </div>
      {issue.state !== "closed" && (
        <IssueActionSheet
          owner={owner}
          repo={repoName}
          number={issue.number}
        />
      )}
    </div>
  );
}
