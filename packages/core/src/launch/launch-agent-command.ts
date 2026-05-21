import type Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { getSetting } from "../db/settings.js";
import type { LaunchAgent } from "../types.js";

const DANGEROUS_METACHARS = /[;&|<>`$\n\r\t()]/;
const LAUNCH_AGENTS = new Set<LaunchAgent>(["claude", "codex"]);

export async function retryLabel<T>(fn: () => Promise<T>): Promise<T> {
  const delaysMs = [500, 1_000, 2_000];
  let lastErr: unknown;
  for (let attempt = 0; attempt < delaysMs.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < delaysMs.length - 1) {
        await new Promise((r) => setTimeout(r, delaysMs[attempt]));
      }
    }
  }
  throw lastErr;
}

export function normalizeLaunchAgent(
  value: LaunchAgent | undefined,
  fallback: LaunchAgent,
): LaunchAgent {
  if (value && LAUNCH_AGENTS.has(value)) return value;
  return fallback;
}

export function getLaunchAgent(db: Database.Database): LaunchAgent {
  const raw = getSetting(db, "launch_agent")?.trim();
  if (raw && LAUNCH_AGENTS.has(raw as LaunchAgent)) {
    return raw as LaunchAgent;
  }
  if (raw) {
    console.warn(
      `[issuectl] launch_agent setting is invalid; falling back to 'claude'. Got: ${JSON.stringify(raw)}`,
    );
  }
  return "claude";
}

export function extraArgsSettingForAgent(
  agent: LaunchAgent,
): "claude_extra_args" | "codex_extra_args" {
  return agent === "codex" ? "codex_extra_args" : "claude_extra_args";
}

/**
 * Build the shell command that the terminal launcher will run. The stored
 * value is trusted (validated at save time) but we apply a cheap metachar
 * check as defense-in-depth — if the value looks dangerous (tampered DB,
 * backup restore, etc.), fall back to the plain agent command and warn.
 */
export function buildLaunchAgentCommand(
  agent: LaunchAgent,
  rawExtraArgs: string | undefined,
): string {
  const command = resolveLaunchAgentBinary(agent);
  const extraArgs = rawExtraArgs?.trim() ?? "";
  if (extraArgs === "") return command;
  if (DANGEROUS_METACHARS.test(extraArgs)) {
    console.warn(
      `[issuectl] ${extraArgsSettingForAgent(agent)} contains unexpected shell metacharacters; falling back to plain '${agent}'. Re-save the value in Settings to re-validate. Got: ${JSON.stringify(extraArgs)}`,
    );
    return command;
  }
  return `${command} ${extraArgs}`;
}

export function buildClaudeCommand(rawExtraArgs: string | undefined): string {
  return buildLaunchAgentCommand("claude", rawExtraArgs);
}

function resolveLaunchAgentBinary(agent: LaunchAgent): string {
  try {
    return execFileSync("which", [agent], { encoding: "utf8" }).trim() || agent;
  } catch {
    return agent;
  }
}
