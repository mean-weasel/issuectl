import type { Command } from "commander";
import {
  getRepoWebhookConfigById,
  listRepos,
  listWebhookEvents,
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

export function registerWebhookCommands(program: Command): void {
  const webhook = program
    .command("webhook")
    .description("Inspect GitHub webhook receiver state");

  webhook
    .command("tail")
    .description("Show recent webhook events")
    .option("--limit <n>", "Number of events to show", "20")
    .action((opts: { limit: string }, command: Command) => {
      const limit = parseCommandInput(command, () => parseLimit(opts.limit));
      const db = requireDb();
      const events = listWebhookEvents(db, limit);

      for (const event of events) {
        process.stdout.write(
          `${event.id}\t${event.eventType}\t${event.action ?? "-"}\t${event.targetType ?? "-"}#${event.targetNumber ?? "-"}\n`,
        );
      }
    });

  webhook
    .command("status")
    .description("Show webhook configuration for tracked repos")
    .action(() => {
      const db = requireDb();

      for (const repo of listRepos(db)) {
        const config = getRepoWebhookConfigById(db, repo.id);
        const secretState = config?.webhookSecret ? "set" : "missing";

        process.stdout.write(
          `${repo.owner}/${repo.name}\tauto_launch=${repo.autoLaunchIssues}\tauto_review=${repo.autoReviewPrs}\tpayload=${repo.webhookPayloadMode}\tsecret=${secretState}\n`,
        );
      }
    });
}
