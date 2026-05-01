"use client";

import { Sheet } from "@/components/paper";
import { launchAgentLabel, type LaunchAgent } from "@/components/launch/agent";
import styles from "./ActionSheet.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  hasLiveDeployment: boolean;
  defaultAgent: LaunchAgent;
  isOffline: boolean;
  onLaunch: () => void;
  onReassign: () => void;
  onCloseIssue: () => void;
};

export function IssueActionsMenu({
  open,
  onClose,
  hasLiveDeployment,
  defaultAgent,
  isOffline,
  onLaunch,
  onReassign,
  onCloseIssue,
}: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="issue actions">
      {!hasLiveDeployment && (
        <button className={styles.item} onClick={onLaunch}>
          <span className={styles.icon}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M8 2Q8.7 7 15 8Q8.7 9 8 15Q7.3 9 1 8Q7.3 7 8 2Z" fill="currentColor" />
              <path d="M14 2Q14.3 4.5 17 5Q14.3 5.3 14 8Q13.7 5.3 11 5Q13.7 4.7 14 2Z" fill="currentColor" opacity="0.5" />
            </svg>
          </span>
          Launch with {launchAgentLabel(defaultAgent)}
        </button>
      )}
      <button
        className={`${styles.item} ${isOffline ? styles.disabled : ""}`}
        onClick={isOffline ? undefined : onReassign}
        disabled={isOffline}
      >
        <span className={styles.icon}>&harr;</span>
        Re-assign to repo
        {isOffline && <span className={styles.offlineHint}>Requires connection</span>}
      </button>
      <button
        className={`${styles.item} ${styles.danger}`}
        onClick={onCloseIssue}
      >
        <span className={styles.icon}>&bull;</span>
        Close issue
        {isOffline && <span className={styles.offlineHint}>Queues until online</span>}
      </button>
    </Sheet>
  );
}
