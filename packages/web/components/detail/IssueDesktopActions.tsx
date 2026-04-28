"use client";

import { Button } from "@/components/paper";
import styles from "./ActionSheet.module.css";

type Props = {
  hasLiveDeployment: boolean;
  onLaunch: () => void;
  onReassign: () => void;
  onCloseIssue: () => void;
};

export function IssueDesktopActions({
  hasLiveDeployment,
  onLaunch,
  onReassign,
  onCloseIssue,
}: Props) {
  return (
    <div className={styles.desktopBar}>
      {!hasLiveDeployment && (
        <Button variant="primary" onClick={onLaunch}>
          Launch with Claude
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
