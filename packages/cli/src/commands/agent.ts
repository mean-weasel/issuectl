import type { Command } from "commander";
import { readFile } from "node:fs/promises";

type CompleteOptions = {
  serverUrl?: string;
  deployment: string;
  status: string;
  summary: string;
  finalHeadSha?: string;
  pushedCommitSha?: string;
};

type MutateOptions = {
  serverUrl?: string;
  deployment: string;
  repoId: string;
  target: string;
  action: string;
  payload?: string;
  payloadFile?: string;
};

const DEFAULT_SERVER_URL = "http://localhost:3847";
const COMPLETION_STATUSES = ["completed", "failed", "no_changes", "pushed_fixes"] as const;
const MUTATION_ACTIONS = ["push", "comment", "label", "create_issue", "create_pr"] as const;

export function registerAgentCommands(program: Command): void {
  const agent = program
    .command("agent")
    .description("Agent check-in helpers for issuectl-managed sessions");

  agent
    .command("complete")
    .requiredOption("--deployment <id>", "Deployment id")
    .requiredOption("--status <status>", "completed, failed, no_changes, or pushed_fixes")
    .requiredOption("--summary <summary>", "Completion summary")
    .option("--final-head-sha <sha>", "Final PR head SHA observed by the agent")
    .option("--pushed-commit-sha <sha>", "Commit SHA pushed by the agent")
    .option("--server-url <url>", "issuectl web server URL", defaultServerUrl())
    .action((opts: CompleteOptions, command: Command) =>
      runCommand(command, () => complete(opts)),
    );

  agent
    .command("mutate")
    .requiredOption("--deployment <id>", "Deployment id")
    .requiredOption("--repo-id <id>", "Tracked repo id")
    .requiredOption("--target <issue#number|pr#number>", "Target reference")
    .requiredOption("--action <action>", "push, comment, label, create_issue, or create_pr")
    .option("--payload <json>", "Mutation payload as JSON")
    .option("--payload-file <path>", "Read mutation payload JSON from a file, or - for stdin")
    .option("--server-url <url>", "issuectl web server URL", defaultServerUrl())
    .action((opts: MutateOptions, command: Command) =>
      runCommand(command, () => mutate(opts)),
    );
}

async function complete(opts: CompleteOptions): Promise<void> {
  const response = await postJson(`${serverUrl(opts.serverUrl)}/api/v1/agent/completion`, {
    deploymentId: positiveInteger(opts.deployment, "--deployment"),
    completionToken: agentToken(),
    status: choice(opts.status, COMPLETION_STATUSES, "--status"),
    summary: opts.summary,
    ...(opts.finalHeadSha ? { finalHeadSha: opts.finalHeadSha } : {}),
    ...(opts.pushedCommitSha ? { pushedCommitSha: opts.pushedCommitSha } : {}),
  });
  process.stdout.write(`${response.accepted ? "accepted" : "rejected"}\n`);
}

async function mutate(opts: MutateOptions): Promise<void> {
  const target = parseTarget(opts.target);
  const payload = await readPayload(opts);
  const response = await postJson(`${serverUrl(opts.serverUrl)}/api/v1/agent/mutations`, {
    deploymentId: positiveInteger(opts.deployment, "--deployment"),
    completionToken: agentToken(),
    repoId: positiveInteger(opts.repoId, "--repo-id"),
    targetType: target.targetType,
    targetNumber: target.targetNumber,
    actionType: choice(opts.action, MUTATION_ACTIONS, "--action"),
    ...(payload === undefined ? {} : { payload }),
  });
  process.stdout.write(`${response.allowed ? "allowed" : "denied"}\n`);
}

async function runCommand(command: Command, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    command.error(err instanceof Error ? err.message : String(err));
  }
}

async function postJson(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof json.reason === "string" ? json.reason : `Request failed with ${response.status}`);
  }
  return json;
}

function agentToken(): string {
  const token = process.env.ISSUECTL_AGENT_TOKEN;
  if (!token) throw new Error("ISSUECTL_AGENT_TOKEN is required");
  return token;
}

function positiveInteger(value: string, name: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive integer`);
  return Number(value);
}

function choice<T extends readonly string[]>(value: string, choices: T, name: string): T[number] {
  if (!choices.includes(value)) throw new Error(`${name} is not supported`);
  return value as T[number];
}

function parseTarget(value: string): { targetType: "issue" | "pr"; targetNumber: number } {
  const match = /^(issue|pr)#([1-9]\d*)$/.exec(value);
  if (!match) throw new Error("--target must use issue#number or pr#number");
  return { targetType: match[1] as "issue" | "pr", targetNumber: Number(match[2]) };
}

function serverUrl(value = DEFAULT_SERVER_URL): string {
  return value.replace(/\/$/, "");
}

function defaultServerUrl(): string {
  return process.env.ISSUECTL_SERVER_URL?.trim() || DEFAULT_SERVER_URL;
}

async function readPayload(opts: MutateOptions): Promise<unknown> {
  if (opts.payload && opts.payloadFile) throw new Error("Use either --payload or --payload-file, not both");
  if (opts.payload) return parseJsonPayload(opts.payload, "--payload");
  if (!opts.payloadFile) return undefined;
  const text = opts.payloadFile === "-"
    ? await readStdin()
    : await readFile(opts.payloadFile, "utf8");
  return parseJsonPayload(text, "--payload-file");
}

function parseJsonPayload(text: string, source: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${source} must be valid JSON`);
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("error", reject);
    process.stdin.on("end", () => resolve(data));
  });
}
