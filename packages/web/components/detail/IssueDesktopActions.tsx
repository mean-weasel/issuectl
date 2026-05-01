"use client";

import { Button } from "@/components/paper";
import { launchAgentLabel, type LaunchAgent } from "@/components/launch/agent";
import styles from "./ActionSheet.module.css";

type Props = {
  hasLiveDeployment: boolean;
  defaultAgent: LaunchAgent;
  onLaunch: () => void;
  onReassign: () => void;
  onCloseIssue: () => void;
};

export function IssueDesktopActions({
  hasLiveDeployment,
  defaultAgent,
  onLaunch,
  onReassign,
  onCloseIssue,
}: Props) {
  return (
    <div className={styles.desktopBar}>
      {!hasLiveDeployment && (
        <Button variant="primary" onClick={onLaunch}>
          Launch with {launchAgentLabel(defaultAgent)}
        </Button>
      )}
      <Button variant="ghost" onClick={onReassign}>
        Re-assign
      </Button>
      <Button variant="ghost" onClick={onCloseIssue}>
        Close issue
      </Button>
    </div>
  );
}
