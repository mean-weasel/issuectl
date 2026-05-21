import { getDb, getDeploymentById } from "@issuectl/core";
import { ensureTtydForDeployment, type EnsureTtydResult } from "./ensure-ttyd";
import { createPtyTerminalToken } from "./terminal-auth";

type TerminalBackend = "ttyd" | "pty_bridge";
type DeploymentWithTerminalBackend = ReturnType<typeof getDeploymentById> & {
  terminalBackend?: TerminalBackend;
};

export type EnsureTerminalResult =
  | ({ backend: "ttyd" } & Extract<EnsureTtydResult, { port: number }>)
  | { backend: "pty_bridge"; deploymentId: number; terminalToken: string; wsUrl: string }
  | { alive: false; error?: string; backend?: TerminalBackend };

export async function ensureTerminalForDeployment(
  deploymentId: number,
): Promise<EnsureTerminalResult> {
  if (!Number.isInteger(deploymentId) || deploymentId <= 0) {
    return { alive: false, error: "Invalid deployment ID" };
  }

  try {
    const db = getDb();
    const deployment = getDeploymentById(db, deploymentId) as DeploymentWithTerminalBackend;
    if (deployment?.terminalBackend === "pty_bridge") {
      const terminalToken = createPtyTerminalToken(deploymentId);
      if (terminalToken && process.env.ISSUECTL_PTY_BRIDGE === "1") {
        return {
          backend: "pty_bridge",
          deploymentId,
          terminalToken,
          wsUrl: `/api/terminal/pty/${deploymentId}/ws?terminalToken=${encodeURIComponent(terminalToken)}`,
        };
      }
      return {
        alive: false,
        backend: "pty_bridge",
        error: "PTY bridge terminal backend is not implemented yet",
      };
    }
  } catch {
    // Let the existing ttyd ensure path keep its current error handling.
  }

  const result = await ensureTtydForDeployment(deploymentId);
  if ("port" in result) {
    return { backend: "ttyd", ...result };
  }
  return result;
}
