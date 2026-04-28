import { Suspense, type ReactNode } from "react";
import type { GitHubIssue, Priority, Deployment } from "@issuectl/core";
import { Chip, LabelChip } from "@/components/paper";
import { timeAgo } from "@/lib/format";
import { DetailTopBar } from "./DetailTopBar";
import {
  DetailMeta,
  StateChip,
  MetaSeparator,
  MetaNum,
} from "./DetailMeta";
import { EditableBody } from "./EditableBody";
import { EditableTitle } from "./EditableTitle";
import { PriorityPicker } from "./PriorityPicker";
import { IssueActionSheet } from "./IssueActionSheet";
import { ReopenButton } from "./ReopenButton";
import styles from "./IssueDetail.module.css";

type Props = {
  owner: string;
  repoName: string;
  repoId: number;
  currentPriority: Priority;
  issue: GitHubIssue;
  repoLocalPath: string | null;
  deployments: Deployment[];
  referencedFiles: string[];
  /** Rendered after the body — used by the page to stream the active-deployment banner and comments. */
  children?: ReactNode;
};

export function IssueDetail({
  owner,
  repoName,
  repoId,
  currentPriority,
  issue,
  repoLocalPath,
  deployments,
  referencedFiles,
  children,
}: Props) {
  const displayLabels = issue.labels.filter(
    (l) => !l.name.startsWith("issuectl:"),
  );

  const hasLiveDeployment = deployments.some((d) => d.endedAt === null);

  return (
    <div className={styles.container} data-lightbox-root>
      <DetailTopBar
        backHref="/"
        crumb={
          <>
            {owner}/<b>{repoName}</b>
          </>
        }
      />
      <div className={styles.body}>
        <EditableTitle
          owner={owner}
          repo={repoName}
          issueNumber={issue.number}
          initialTitle={issue.title}
        />
        <DetailMeta>
          <Chip>{repoName}</Chip>
          <MetaNum>#{issue.number}</MetaNum>
          <MetaSeparator />
          <StateChip state={issue.state} />
          {displayLabels.length > 0 && (
            <>
              <MetaSeparator />
              {displayLabels.map((l) => (
                <LabelChip key={l.name} name={l.name} color={l.color} />
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

        {issue.state === "closed" ? (
          <ReopenButton owner={owner} repo={repoName} issueNumber={issue.number} />
        ) : (
          <Suspense fallback={null}>
            <IssueActionSheet
              owner={owner}
              repo={repoName}
              repoId={repoId}
              number={issue.number}
              repoLocalPath={repoLocalPath}
              issue={issue}
              deployments={deployments}
              referencedFiles={referencedFiles}
              hasLiveDeployment={hasLiveDeployment}
            />
          </Suspense>
        )}
        <EditableBody
          owner={owner}
          repo={repoName}
          issueNumber={issue.number}
          initialBody={issue.body}
        />
        {children}
      </div>
    </div>
  );
}
