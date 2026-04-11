"use client";

import { useState } from "react";
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
import { mergePullAction } from "@/lib/actions/pulls";
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

  const [confirming, setConfirming] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [merged, setMerged] = useState(false);

  const handleMergeClick = () => {
    setMergeError(null);
    setConfirming(true);
  };

  const handleConfirm = async () => {
    setConfirming(false);
    setMerging(true);
    setMergeError(null);
    const result = await mergePullAction(owner, repoName, pull.number);
    setMerging(false);
    if (result.success) {
      setMerged(true);
    } else {
      setMergeError(result.error ?? "Merge failed");
    }
  };

  const handleCancel = () => {
    setConfirming(false);
  };

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
          <StateChip state={merged ? "merged" : prState} />
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

        {prState === "open" && !merged && (
          <>
            {confirming ? (
              <div className={styles.confirmRow}>
                <span className={styles.confirmLabel}>
                  merge into <b>{pull.baseRef}</b>?
                </span>
                <button
                  className={styles.confirmBtn}
                  onClick={handleConfirm}
                >
                  yes, merge →
                </button>
                <button
                  className={styles.cancelBtn}
                  onClick={handleCancel}
                >
                  cancel
                </button>
              </div>
            ) : (
              <button
                className={styles.mergeBtn}
                onClick={handleMergeClick}
                disabled={merging}
              >
                {merging ? "merging…" : "merge pull request →"}
              </button>
            )}
            {mergeError && (
              <div className={styles.mergeError}>{mergeError}</div>
            )}
          </>
        )}

        {merged && (
          <div className={styles.mergedBanner}>merged successfully</div>
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
