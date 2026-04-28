import type {
  GitHubPull,
  GitHubCheck,
  GitHubPullFile,
  GitHubIssue,
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
import { CIChecks } from "./CIChecks";
import { FilesChanged } from "./FilesChanged";
import { MergeButton } from "./MergeButton";
import styles from "./PrDetail.module.css";

type Props = {
  owner: string;
  repoName: string;
  pull: GitHubPull;
  checks: GitHubCheck[];
  files: GitHubPullFile[];
  linkedIssue: GitHubIssue | null;
};

export function PrDetail({
  owner,
  repoName,
  pull,
  checks,
  files,
  linkedIssue,
}: Props) {
  const prState: "open" | "closed" | "merged" = pull.merged
    ? "merged"
    : pull.state;

  return (
    <div className={styles.container}>
      <DetailTopBar
        backHref="/?tab=prs"
        crumb={<>{owner}/<b>{repoName}</b></>}
      />
      <div className={styles.body}>
        <h1 className={styles.title}>{pull.title}</h1>
        <DetailMeta>
          <Chip>{repoName}</Chip>
          <MetaNum>#{pull.number}</MetaNum>
          <MetaSeparator />
          <StateChip state={prState} />
          {linkedIssue && (
            <>
              <MetaSeparator />
              <span>closes #{linkedIssue.number}</span>
            </>
          )}
          <MetaSeparator />
          <span>
            +{pull.additions} / −{pull.deletions} across {pull.changedFiles}{" "}
            files
          </span>
        </DetailMeta>

        {prState === "open" && (
          <MergeButton
            owner={owner}
            repoName={repoName}
            pullNumber={pull.number}
            baseRef={pull.baseRef}
            draft={pull.draft}
            checks={checks}
          />
        )}

        <h2 className={styles.section}>description</h2>
        <BodyText body={pull.body} />

        <h2 className={styles.section}>ci checks</h2>
        <CIChecks checks={checks} />

        <h2 className={styles.section}>files changed</h2>
        <FilesChanged files={files} />
      </div>
    </div>
  );
}
