import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type Database from "better-sqlite3";
import { recordDiagnosticEventSafely } from "../db/diagnostics.js";
import type { DeploymentTargetType, DeploymentTriggeredBy, LaunchAgent } from "../types.js";
import type { LaunchDiagnosticContext } from "./launch-diagnostics.js";

export type AgentPreflightInput = {
  db: Database.Database;
  diagnosticContext: LaunchDiagnosticContext;
  deploymentId: number;
  agent: LaunchAgent;
  workspacePath: string;
  triggeredBy?: DeploymentTriggeredBy;
};

export async function runAgentPreflight(input: AgentPreflightInput): Promise<void> {
  if (!shouldTrustCodexWorkspace(input.agent, input.triggeredBy)) return;

  recordDiagnosticEventSafely(input.db, {
    ...diagnosticBase(input.diagnosticContext),
    level: "info",
    event: "agent.preflight.started",
    deploymentId: input.deploymentId,
    data: { agent: input.agent, workspacePath: input.workspacePath },
  });

  try {
    const result = await trustCodexProject(input.workspacePath);
    recordDiagnosticEventSafely(input.db, {
      ...diagnosticBase(input.diagnosticContext),
      level: "info",
      event: result.changed ? "codex.trust.recorded" : "codex.trust.already_trusted",
      deploymentId: input.deploymentId,
      data: { workspacePath: input.workspacePath, configPath: result.configPath },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordDiagnosticEventSafely(input.db, {
      ...diagnosticBase(input.diagnosticContext),
      level: "error",
      event: "codex.trust.failed",
      deploymentId: input.deploymentId,
      message,
      data: { workspacePath: input.workspacePath },
    });
    throw new Error(`Failed to trust Codex workspace before launch: ${message}`, {
      cause: err,
    });
  }
}

export function shouldTrustCodexWorkspace(
  agent: LaunchAgent,
  triggeredBy?: DeploymentTriggeredBy,
): boolean {
  return agent === "codex" && (triggeredBy === "webhook" || triggeredBy === "comment_command");
}

export async function trustCodexProject(
  workspacePath: string,
): Promise<{ changed: boolean; configPath: string }> {
  const configPath = codexConfigPath();
  const projectHeader = `[projects.${JSON.stringify(workspacePath)}]`;
  const trustedLine = `trust_level = "trusted"`;

  let config = "";
  try {
    config = await readFile(configPath, "utf8");
  } catch (err) {
    if ((err as { code?: string }).code !== "ENOENT") throw err;
  }

  const existing = findTomlTable(config, projectHeader);
  if (existing && /\btrust_level\s*=\s*"trusted"/.test(existing.body)) {
    return { changed: false, configPath };
  }

  let nextConfig: string;
  if (existing) {
    const body = /\btrust_level\s*=/.test(existing.body)
      ? existing.body.replace(/\btrust_level\s*=\s*"[^"]*"/, trustedLine)
      : `${existing.body.replace(/\s*$/, "")}\n${trustedLine}\n`;
    nextConfig = `${config.slice(0, existing.start)}${existing.header}\n${body}${config.slice(existing.end)}`;
  } else {
    const prefix = config.trimEnd();
    const addition = `${projectHeader}\n${trustedLine}\n`;
    nextConfig = prefix ? `${prefix}\n\n${addition}` : addition;
  }

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, nextConfig, "utf8");
  return { changed: true, configPath };
}

function codexConfigPath(): string {
  return join(process.env.CODEX_HOME || join(homedir(), ".codex"), "config.toml");
}

function findTomlTable(
  config: string,
  header: string,
): { start: number; end: number; header: string; body: string } | null {
  const headerPattern = escapeRegExp(header);
  const re = new RegExp(`(^|\\n)(${headerPattern})\\n`, "m");
  const match = re.exec(config);
  if (!match) return null;

  const start = match.index + match[1].length;
  const bodyStart = start + match[2].length + 1;
  const rest = config.slice(bodyStart);
  const nextHeader = /\n\[/.exec(rest);
  const end = nextHeader ? bodyStart + nextHeader.index + 1 : config.length;
  return {
    start,
    end,
    header: match[2],
    body: config.slice(bodyStart, end),
  };
}

function diagnosticBase(ctx: LaunchDiagnosticContext): {
  source: string;
  correlationId: string;
  owner: string;
  repo: string;
  issueNumber?: number;
  targetType: DeploymentTargetType;
  targetNumber: number;
} {
  return {
    source: "core.launch",
    correlationId: ctx.correlationId,
    owner: ctx.owner,
    repo: ctx.repo,
    issueNumber: ctx.issueNumber,
    targetType: ctx.targetType,
    targetNumber: ctx.targetNumber,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
