import type { Command } from "commander";
import {
  getRepoWebhookConfigById,
  listRepos,
  listWebhookEvents,
} from "@issuectl/core";
import { requireDb } from "../utils/db.js";

function parseLimit(value: string | undefined): number {
  const parsed = Number(value ?? "20");
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.floor(parsed));
}

export function registerWebhookCommands(program: Command): void {
  const webhook = program
    .command("webhook")
    .description("Inspect GitHub webhook receiver state");

  webhook
    .command("tail")
    .description("Show recent webhook events")
    .option("--limit <n>", "Number of events to show", "20")
    .action((opts: { limit?: string }) => {
      const db = requireDb();
      const events = listWebhookEvents(db, parseLimit(opts.limit));

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
