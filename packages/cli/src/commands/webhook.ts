import { randomBytes } from "node:crypto";
import type { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import {
  getRepoWebhookConfigById,
  getSetting,
  listRepos,
  listWebhookEvents,
  updateRepoWebhookSettings,
  withAuthRetry,
  type RepoWebhookConfig,
  type WebhookTargetType,
} from "@issuectl/core";
import { requireDb } from "../utils/db.js";
import { registerWebhookIntentCommands } from "./webhook-intents.js";

type WebhookOctokit = {
  rest: {
    repos: {
      createWebhook(input: Record<string, unknown>): Promise<{ data: { id: number } }>;
      updateWebhook(input: Record<string, unknown>): Promise<{ data: { id: number } }>;
    };
    users: {
      getAuthenticated(): Promise<{ data: { login: string } }>;
    };
  };
};

const ISSUECTL_WEBHOOK_EVENTS = [
  "issues",
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
  "issue_comment",
  "push",
];

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

function findRepoConfig(
  command: Command,
  repoRef: string,
): { db: ReturnType<typeof requireDb>; repo: RepoWebhookConfig } {
  const db = requireDb();
  const { owner, name } = parseCommandInput(command, () => parseRepoRef(repoRef));
  const repo = listRepos(db).find((candidate) =>
    candidate.owner === owner && candidate.name === name,
  );
  if (!repo) command.error(`Tracked repo not found: ${repoRef}`);
  const config = getRepoWebhookConfigById(db, repo.id);
  if (!config) command.error(`Tracked repo not found: ${repoRef}`);
  return { db, repo: config };
}

function webhookUrl(db: ReturnType<typeof requireDb>, repoId: number): string {
  const baseUrl = getSetting(db, "public_webhook_base_url");
  if (!baseUrl) {
    throw new Error("public_webhook_base_url is not configured.");
  }
  return `${baseUrl.replace(/\/$/, "")}/api/webhook/github/${repoId}`;
}

async function requireConfirmation(
  yes: boolean | undefined,
  message: string,
): Promise<void> {
  if (yes) return;
  const ok = await confirm({ message, default: false });
  if (!ok) throw new Error("Cancelled.");
}

function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

async function configureWebhook(
  command: Command,
  repoRef: string,
  opts: { yes?: boolean; rotate?: boolean },
): Promise<void> {
  const { db, repo } = findRepoConfig(command, repoRef);
  const url = parseCommandInput(command, () => webhookUrl(db, repo.id));
  if (opts.rotate && !repo.webhookId) {
    command.error("Tracked repo has no stored webhook id to rotate.");
  }
  if (!opts.rotate && repo.webhookId) {
    command.error("Tracked repo already has a stored webhook id. Use `issuectl webhook rotate`.");
  }
  const createdBy = await withAuthRetry((octokit) =>
    getAuthenticatedLogin(octokit as WebhookOctokit),
  );
  await parseCommandInput(command, () =>
    requireConfirmation(
      opts.yes,
      `${opts.rotate ? "Rotate" : "Create"} GitHub webhook for ${repo.owner}/${repo.name} as ${createdBy}?`,
    ),
  );

  const secret = generateWebhookSecret();
  const result = await withAuthRetry((octokit) => opts.rotate
    ? rotateWebhook(octokit as WebhookOctokit, {
      owner: repo.owner, repo: repo.name, hookId: repo.webhookId ?? 0, url, secret,
    })
    : createWebhook(octokit as WebhookOctokit, {
      owner: repo.owner, repo: repo.name, url, secret,
    }));
  updateRepoWebhookSettings(db, repo.id, {
    webhookId: result.id,
    webhookSecret: secret,
  });
  process.stdout.write(
    `${opts.rotate ? "rotated" : "created"}\t${repo.owner}/${repo.name}\thook_id=${result.id}\turl=${url}\tuser=${createdBy}\n`,
  );
}

async function createWebhook(
  octokit: WebhookOctokit,
  input: { owner: string; repo: string; url: string; secret: string },
) {
  const { data } = await octokit.rest.repos.createWebhook({
    owner: input.owner,
    repo: input.repo,
    name: "web",
    active: true,
    events: ISSUECTL_WEBHOOK_EVENTS,
    config: webhookConfig(input),
  });
  return { id: data.id };
}

async function rotateWebhook(
  octokit: WebhookOctokit,
  input: { owner: string; repo: string; hookId: number; url: string; secret: string },
) {
  const { data } = await octokit.rest.repos.updateWebhook({
    owner: input.owner,
    repo: input.repo,
    hook_id: input.hookId,
    active: true,
    events: ISSUECTL_WEBHOOK_EVENTS,
    config: webhookConfig(input),
  });
  return { id: data.id };
}

async function getAuthenticatedLogin(octokit: WebhookOctokit): Promise<string> {
  const { data } = await octokit.rest.users.getAuthenticated();
  return data.login;
}

function webhookConfig(input: { url: string; secret: string }) {
  return {
    url: input.url,
    content_type: "json",
    secret: input.secret,
    insecure_ssl: "0",
  };
}

export function registerWebhookCommands(program: Command): void {
  const webhook = program
    .command("webhook")
    .description("Inspect GitHub webhook receiver state");

  webhook
    .command("tail")
    .description("Show recent webhook events")
    .option("--limit <n>", "Number of events to show", "20")
    .option("--repo <owner/name>", "Filter events by tracked repo")
    .option("--target <issue#number|pr#number>", "Filter events by target")
    .action((opts: { limit: string; repo?: string; target?: string }, command: Command) => {
      const { limit, target } = parseCommandInput(command, () => ({
        limit: parseLimit(opts.limit),
        target: opts.target ? parseTargetRef(opts.target) : undefined,
      }));
      const db = requireDb();
      const repoId = parseCommandInput(command, () =>
        findRepoId(listRepos(db), opts.repo),
      );
      const events = listWebhookEvents(db, {
        limit,
        repoId,
        targetType: target?.targetType,
        targetNumber: target?.targetNumber,
      });

      for (const event of events) {
        process.stdout.write(
          `${event.id}\t${event.eventType}\t${event.action ?? "-"}\t${event.targetType ?? "-"}#${event.targetNumber ?? "-"}\n`,
        );
      }
    });

  webhook
    .command("status")
    .argument("[repo]", "Tracked repo to show, as owner/name")
    .description("Show webhook configuration for tracked repos")
    .action((repoRef: string | undefined, command: Command) => {
      const db = requireDb();
      const repos = parseCommandInput(command, () => {
        const allRepos = listRepos(db);
        if (!repoRef) return allRepos;
        const { owner, name } = parseRepoRef(repoRef);
        return allRepos.filter(
          (repo) => repo.owner === owner && repo.name === name,
        );
      });

      if (repoRef && repos.length === 0) {
        command.error(`Tracked repo not found: ${repoRef}`);
      }

      for (const repo of repos) {
        const config = getRepoWebhookConfigById(db, repo.id);
        const secretState = config?.webhookSecret ? "set" : "missing";
        const baseUrl = getSetting(db, "public_webhook_base_url");
        const webhookUrl = baseUrl
          ? `\turl=${baseUrl.replace(/\/$/, "")}/api/webhook/github/${repo.id}`
          : "";

        process.stdout.write(
          `${repo.owner}/${repo.name}\tauto_launch=${repo.autoLaunchIssues}\tauto_review=${repo.autoReviewPrs}\tpayload=${repo.webhookPayloadMode}\tsecret=${secretState}${webhookUrl}\n`,
        );
      }
    });

  registerWebhookIntentCommands(webhook);

  webhook
    .command("create <repo>")
    .description("Create the GitHub webhook for a tracked repo")
    .option("--yes", "Skip confirmation prompt")
    .action((repoRef: string, opts: { yes?: boolean }, command: Command) =>
      configureWebhook(command, repoRef, { yes: opts.yes, rotate: false }),
    );

  webhook
    .command("rotate <repo>")
    .description("Rotate the stored GitHub webhook secret for a tracked repo")
    .option("--yes", "Skip confirmation prompt")
    .action((repoRef: string, opts: { yes?: boolean }, command: Command) =>
      configureWebhook(command, repoRef, { yes: opts.yes, rotate: true }),
    );
}
