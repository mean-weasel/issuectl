import { tmuxSessionName } from "@issuectl/core";

export type DeploymentTargetType = "issue" | "pr";

export type DeploymentTargetCompat = {
  issueNumber?: number | null;
  targetType?: DeploymentTargetType | null;
  targetNumber?: number | null;
};

export function getDeploymentTarget(deployment: DeploymentTargetCompat): {
  targetType: DeploymentTargetType;
  targetNumber: number;
} {
  const targetType = deployment.targetType ?? "issue";
  const targetNumber = deployment.targetNumber ?? deployment.issueNumber;
  if (typeof targetNumber !== "number" || !Number.isInteger(targetNumber) || targetNumber <= 0) {
    throw new Error("Deployment target is missing");
  }
  return { targetType, targetNumber };
}

export function issueNumberForDiagnostic(
  deployment: DeploymentTargetCompat,
): number | undefined {
  const targetType = deployment.targetType ?? "issue";
  if (targetType !== "issue") return undefined;
  return deployment.targetNumber ?? deployment.issueNumber ?? undefined;
}

const targetTmuxSessionName = tmuxSessionName as (
  repo: string,
  targetNumber: number,
  targetType?: DeploymentTargetType,
) => string;

export function deploymentSessionName(
  repo: string,
  deployment: DeploymentTargetCompat,
): string {
  const target = getDeploymentTarget(deployment);
  return targetTmuxSessionName(repo, target.targetNumber, target.targetType);
}
