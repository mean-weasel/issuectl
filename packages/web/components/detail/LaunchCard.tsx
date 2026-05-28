import type { Deployment } from "@issuectl/core";
import { LaunchActiveBanner } from "@/components/launch/LaunchActiveBanner";
import { deploymentLaunchAgent } from "@/components/launch/agent";
import {
  CompletedSessionCard,
  latestCompletedDeployment,
} from "./CompletedSessionCard";

type Props = {
  owner: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  deployments: Deployment[];
};

export function LaunchCard({ owner, repo, issueNumber, issueTitle, deployments }: Props) {
  const liveDeployment = deployments.find((d) => d.endedAt === null);
  if (liveDeployment) {
    return (
      <LaunchActiveBanner
        deploymentId={liveDeployment.id}
        branchName={liveDeployment.branchName}
        endedAt={liveDeployment.endedAt}
        owner={owner}
        repo={repo}
        issueNumber={issueNumber}
        issueTitle={issueTitle}
        ttydPort={liveDeployment.ttydPort}
        agent={deploymentLaunchAgent(liveDeployment)}
      />
    );
  }

  const completedDeployment = latestCompletedDeployment(deployments);
  if (!completedDeployment) return null;

  return (
    <CompletedSessionCard
      owner={owner}
      repo={repo}
      targetType="issue"
      targetNumber={issueNumber}
      deployment={completedDeployment}
    />
  );
}
