import type {
  Deployment,
  GitHubPull,
  GitHubCheck,
  GitHubPullFile,
  GitHubPullReview,
  GitHubIssue,
  GitHubLabel,
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
import { ReviewPanel } from "./ReviewPanel";
import { FilesChanged } from "./FilesChanged";
import { MergeButton } from "./MergeButton";
import { DetailKeyboardNav } from "./DetailKeyboardNav";
import { KeyboardHelpOverlay } from "@/components/ui/KeyboardHelpOverlay";
import { LabelManager } from "@/components/issue/LabelManager";
import { OpenTerminalButton } from "@/components/terminal/OpenTerminalButton";
import { launchAgentLabel } from "@/components/launch/agent";
import type { WebhookAutomationHealth } from "@/lib/webhook-health";
import {
  CompletedSessionCard,
  latestCompletedDeployment,
} from "./CompletedSessionCard";
import styles from "./PrDetail.module.css";

type Props = {
  owner: string;
  repoName: string;
  pull: GitHubPull;
  checks: GitHubCheck[];
  files: GitHubPullFile[];
  reviews: GitHubPullReview[];
  linkedIssue: GitHubIssue | null;
  availableLabels: GitHubLabel[];
  deployments: Deployment[];
  webhookHealth: WebhookAutomationHealth | null;
};

export function PrDetail({
  owner,
  repoName,
  pull,
  checks,
  files,
  reviews,
  linkedIssue,
  availableLabels,
  deployments,
  webhookHealth,
}: Props) {
  const prState: "open" | "closed" | "merged" = pull.merged
    ? "merged"
    : pull.state;
  const activeDeployment = deployments.find((deployment) => deployment.endedAt === null);
  const completedDeployment = activeDeployment
    ? null
    : latestCompletedDeployment(deployments);

  return (
    <div className={styles.container}>
      <DetailKeyboardNav backHref="/?tab=prs" />
      <KeyboardHelpOverlay />
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

        <section className={styles.labelPanel} aria-label="PR labels">
          <LabelManager
            owner={owner}
            repo={repoName}
            issueNumber={pull.number}
            targetType="pr"
            currentLabels={pull.labels ?? []}
            availableLabels={availableLabels}
            webhookHealth={webhookHealth}
          />
        </section>

        {activeDeployment && (
          <section className={styles.sessionPanel} aria-label="Active PR session">
            <div>
              <h2 className={styles.sessionTitle}>active review session</h2>
              <p className={styles.sessionMeta}>
                #{activeDeployment.id} · {launchAgentLabel(activeDeployment.agent)} · {activeDeployment.branchName}
              </p>
            </div>
            {activeDeployment.ttydPort && (
              <OpenTerminalButton
                ttydPort={activeDeployment.ttydPort}
                deploymentId={activeDeployment.id}
                owner={owner}
                repo={repoName}
                issueNumber={pull.number}
                targetType="pr"
                targetNumber={pull.number}
                issueTitle={pull.title}
              />
            )}
          </section>
        )}

        {completedDeployment && (
          <CompletedSessionCard
            owner={owner}
            repo={repoName}
            targetType="pr"
            targetNumber={pull.number}
            deployment={completedDeployment}
          />
        )}

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

        <h2 className={styles.section}>reviews</h2>
        <ReviewPanel
          owner={owner}
          repoName={repoName}
          pullNumber={pull.number}
          reviews={reviews}
          isOpen={prState === "open"}
        />

        <h2 className={styles.section}>files changed</h2>
        <FilesChanged files={files} />
      </div>
    </div>
  );
}
