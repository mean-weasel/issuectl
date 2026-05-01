import type { Deployment } from "@issuectl/core";
import { LaunchActiveBanner } from "@/components/launch/LaunchActiveBanner";
import { deploymentLaunchAgent } from "@/components/launch/agent";

type Props = {
  owner: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  deployments: Deployment[];
};

export function LaunchCard({ owner, repo, issueNumber, issueTitle, deployments }: Props) {
  const liveDeployment = deployments.find((d) => d.endedAt === null);
  if (!liveDeployment) return null;

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
