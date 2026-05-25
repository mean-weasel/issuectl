import type { Command } from "commander";
import {
  dropWebhookIntent,
  fireWebhookIntent,
  listRepos,
  listWebhookIntents,
  type WebhookIntentStatus,
  type WebhookTargetType,
} from "@issuectl/core";
import { requireDb } from "../utils/db.js";

function parseLimit(value: string): number {
  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    throw new Error("--limit must be a positive integer.");
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("--limit must be a positive integer.");
  }

  return parsed;
}

function parseCommandInput<T>(command: Command, parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof Error) {
      command.error(error.message);
    }
    throw error;
  }
}

function parseRepoRef(value: string): { owner: string; name: string } {
  const parts = value.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("--repo must use owner/name.");
  }
  return { owner: parts[0], name: parts[1] };
}

function parseTargetRef(value: string): {
  targetType: WebhookTargetType;
  targetNumber: number;
} {
  const match = /^(issue|pr)#([1-9]\d*)$/.exec(value);
  if (!match) {
    throw new Error("--target must use issue#number or pr#number.");
  }
  return {
    targetType: match[1] as WebhookTargetType,
    targetNumber: Number(match[2]),
  };
}

function parseIntentStatus(value: string | undefined): WebhookIntentStatus | "active" | "terminal" | undefined {
  if (value === undefined) return undefined;
  const allowed = new Set([
    "active",
    "terminal",
    "pending",
    "processing",
    "deferred",
    "launched",
    "skipped_locked",
    "skipped_optout",
    "expired",
    "failed",
  ]);
  if (!allowed.has(value)) {
    throw new Error("--status must be active, terminal, or a webhook intent status.");
  }
  return value as WebhookIntentStatus | "active" | "terminal";
}

function findRepoId(
  repos: ReturnType<typeof listRepos>,
  value: string | undefined,
): number | undefined {
  if (!value) return undefined;
  const repoRef = parseRepoRef(value);
  const repo = repos.find(
    (candidate) =>
      candidate.owner === repoRef.owner && candidate.name === repoRef.name,
  );
  if (!repo) {
    throw new Error(`Tracked repo not found: ${value}`);
  }
  return repo.id;
}

async function requireConfirmation(
  yes: boolean | undefined,
  message: string,
): Promise<void> {
  if (yes) return;
  const { confirm } = await import("@inquirer/prompts");
  const ok = await confirm({ message, default: false });
  if (!ok) throw new Error("Cancelled.");
}

export function registerWebhookIntentCommands(webhook: Command): void {
  webhook
    .command("intents")
    .description("Show webhook debounce/launch intents")
    .option("--limit <n>", "Number of intents to show", "20")
    .option("--repo <owner/name>", "Filter intents by tracked repo")
    .option("--target <issue#number|pr#number>", "Filter intents by target")
    .option("--status <status>", "Filter by active, terminal, or intent status")
    .action((opts: { limit: string; repo?: string; target?: string; status?: string }, command: Command) => {
      const { limit, target, status } = parseCommandInput(command, () => ({
        limit: parseLimit(opts.limit),
        target: opts.target ? parseTargetRef(opts.target) : undefined,
        status: parseIntentStatus(opts.status),
      }));
      const db = requireDb();
      const repos = listRepos(db);
      const repoId = parseCommandInput(command, () =>
        findRepoId(repos, opts.repo),
      );
      const repoNames = new Map(repos.map((repo) => [repo.id, `${repo.owner}/${repo.name}`]));
      const intents = listWebhookIntents(db, {
        limit,
        repoId,
        targetType: target?.targetType,
        targetNumber: target?.targetNumber,
        status,
      });

      for (const intent of intents) {
        process.stdout.write(
          `${intent.id}\t${repoNames.get(intent.repoId) ?? intent.repoId}\t${intent.targetType}#${intent.targetNumber}\t${intent.status}\tscheduled=${intent.scheduledAt}\tsignals=${intent.signalCount}\n`,
        );
      }
    });

  const intent = webhook
    .command("intent")
    .description("Operator controls for webhook intents");

  intent
    .command("fire <intent-id>")
    .description("Schedule a pending or deferred webhook intent to fire immediately")
    .option("--yes", "Skip confirmation prompt")
    .action(async (intentId: string, opts: { yes?: boolean }, command: Command) => {
      const id = parseCommandInput(command, () => parseLimit(intentId));
      await parseCommandInput(command, () =>
        requireConfirmation(opts.yes, `Fire webhook intent ${id} immediately?`),
      );
      const db = requireDb();
      const fired = fireWebhookIntent(db, id, Date.now());
      if (!fired) command.error(`No pending or deferred webhook intent found for id ${id}.`);
      process.stdout.write(`${fired.id}\t${fired.targetType}#${fired.targetNumber}\t${fired.status}\tscheduled=${fired.scheduledAt}\n`);
    });

  intent
    .command("drop <intent-id>")
    .description("Drop an active webhook intent")
    .option("--yes", "Skip confirmation prompt")
    .option("--reason <reason>", "Failure reason to record", "operator_dropped")
    .action(async (intentId: string, opts: { yes?: boolean; reason: string }, command: Command) => {
      const id = parseCommandInput(command, () => parseLimit(intentId));
      await parseCommandInput(command, () =>
        requireConfirmation(opts.yes, `Drop webhook intent ${id}?`),
      );
      const db = requireDb();
      const dropped = dropWebhookIntent(db, id, Date.now(), opts.reason);
      if (!dropped) command.error(`No active webhook intent found for id ${id}.`);
      process.stdout.write(`${dropped.id}\t${dropped.targetType}#${dropped.targetNumber}\t${dropped.status}\treason=${dropped.failureReason ?? "-"}\n`);
    });
}
