export type LaunchAgent = "claude" | "codex";

export const LAUNCH_AGENTS: readonly LaunchAgent[] = ["claude", "codex"];

export function normalizeLaunchAgent(value: string | null | undefined): LaunchAgent {
  return value === "codex" ? "codex" : "claude";
}

export function launchAgentLabel(agent: LaunchAgent): string {
  return agent === "codex" ? "Codex" : "Claude Code";
}

export function launchAgentCommand(agent: LaunchAgent): string {
  return agent === "codex" ? "codex" : "claude";
}

export function deploymentLaunchAgent(deployment: unknown): LaunchAgent {
  const agent =
    deployment !== null &&
    typeof deployment === "object" &&
    "agent" in deployment &&
    typeof deployment.agent === "string"
      ? deployment.agent
      : undefined;
  return normalizeLaunchAgent(agent);
}
