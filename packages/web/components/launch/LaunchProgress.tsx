import type { Deployment } from "@issuectl/core";
import { LIFECYCLE_LABEL } from "@issuectl/core";
import { deploymentLaunchAgent, launchAgentLabel } from "./agent";
import styles from "./LaunchProgress.module.css";

type StepStatus = "done" | "active" | "pending";

type Step = {
  label: string;
  detail: string;
  highlightDetail?: boolean;
  status: StepStatus;
};

type Props = {
  deployment: Deployment;
  counts?: { commentCount: number; fileCount: number };
};

/**
 * Derive step statuses from real deployment data.
 *
 * Timeline:  pending → active (ttydPort set) → endedAt set
 *
 * Steps advance based on these transitions:
 * 1. Context assembled: done once the deployment row exists (always true here)
 * 2. Deployment created: done once the deployment row exists
 * 3. Branch checked out: done once state is "active"
 * 4. Lifecycle label applied: done once state is "active"
 * 5. Session status: active while running, done when ended
 */
function deriveSteps(deployment: Deployment, counts: Props["counts"]): Step[] {
  const isActive = deployment.state === "active";
  const ended = deployment.endedAt !== null;
  const agentLabel = launchAgentLabel(deploymentLaunchAgent(deployment));

  const contextDetail = counts
    ? `issue + ${counts.commentCount} comment${counts.commentCount !== 1 ? "s" : ""} + ${counts.fileCount} referenced file${counts.fileCount !== 1 ? "s" : ""}`
    : "issue + selected comments + referenced files";

  return [
    {
      label: "Assembled issue context",
      detail: contextDetail,
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
      status: isActive || ended ? "done" : "active",
    },
    {
      label: "Applied lifecycle label",
      detail: LIFECYCLE_LABEL.deployed,
      status: isActive || ended ? "done" : "pending",
    },
    {
      label: ended ? "Session ended" : `${agentLabel} running`,
      detail: deployment.workspacePath,
      highlightDetail: true,
      status: ended ? "done" : isActive ? "active" : "pending",
    },
  ];
}

const statusClassName: Record<StepStatus, string> = {
  done: styles.numDone,
  active: styles.numActive,
  pending: styles.numPending,
};

const labelClassName: Record<StepStatus, string> = {
  done: styles.label,
  active: styles.labelActive,
  pending: styles.labelPending,
};

const statusIcon: Record<StepStatus, string> = {
  done: "\u2713",
  active: "",
  pending: "",
};

export function LaunchProgress({ deployment, counts }: Props) {
  const steps = deriveSteps(deployment, counts);

  return (
    <div className={styles.steps} role="status" aria-live="polite">
      {steps.map((step) => (
        <div key={step.label} className={styles.step}>
          <div className={statusClassName[step.status]}>
            {statusIcon[step.status]}
          </div>
          <div className={styles.content}>
            <div className={labelClassName[step.status]}>
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
