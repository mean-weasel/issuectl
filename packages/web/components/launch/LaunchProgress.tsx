import type { Deployment } from "@issuectl/core";
import { LIFECYCLE_LABEL } from "@issuectl/core";
import styles from "./LaunchProgress.module.css";

type Step = {
  label: string;
  detail: string;
  highlightDetail?: boolean;
  status: "done" | "active";
};

type Props = {
  deployment: Deployment;
  commentCount: number | null;
  fileCount: number | null;
};

function contextDetail(
  commentCount: number | null,
  fileCount: number | null,
): string {
  if (commentCount === null || fileCount === null) {
    return "issue + selected comments + referenced files";
  }
  return `issue + ${commentCount} comment${commentCount !== 1 ? "s" : ""} + ${fileCount} referenced file${fileCount !== 1 ? "s" : ""}`;
}

export function LaunchProgress({ deployment, commentCount, fileCount }: Props) {
  const ended = deployment.endedAt !== null;
  const steps: Step[] = [
    {
      label: "Assembled issue context",
      detail: contextDetail(commentCount, fileCount),
      status: "done",
    },
    {
      label: "Checked deployment history",
      detail: `Deployment #${deployment.id}`,
      status: "done",
    },
    {
      label: "Checked out branch",
      detail: deployment.branchName,
      highlightDetail: true,
      status: "done",
    },
    {
      label: "Applied lifecycle label",
      detail: LIFECYCLE_LABEL.deployed,
      status: "done",
    },
    {
      label: ended ? "Session ended" : "Claude Code running",
      detail: deployment.workspacePath,
      highlightDetail: true,
      status: ended ? "done" : "active",
    },
  ];

  return (
    <div className={styles.steps} role="status" aria-live="polite">
      {steps.map((step) => (
        <div key={step.label} className={styles.step}>
          <div
            className={
              step.status === "done" ? styles.numDone : styles.numActive
            }
          >
            {step.status === "done" ? "\u2713" : ""}
          </div>
          <div className={styles.content}>
            <div
              className={
                step.status === "active" ? styles.labelActive : styles.label
              }
            >
              {step.label}
            </div>
            <div className={styles.detail}>
              {step.highlightDetail ? (
                <span className={styles.highlight}>{step.detail}</span>
              ) : (
                step.detail
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
