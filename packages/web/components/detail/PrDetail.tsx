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
        menu="···"
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
          <>
            <button className={styles.mergeBtn} disabled>
              merge pull request →
            </button>
            <div className={styles.hint}>wired up in Phase 5</div>
          </>
        )}

        <div className={styles.section}>description</div>
        <BodyText body={pull.body} />

        <div className={styles.section}>ci checks</div>
        <CIChecks checks={checks} />

        <div className={styles.section}>files changed</div>
        <FilesChanged files={files} />
      </div>
    </div>
  );
}
