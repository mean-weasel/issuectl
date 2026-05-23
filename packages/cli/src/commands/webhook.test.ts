import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRepoWebhookConfigById,
  listRepos,
  listWebhookEvents,
  type Repo,
  type RepoWebhookConfig,
  type WebhookEvent,
} from "@issuectl/core";
import { requireDb } from "../utils/db.js";
import { registerWebhookCommands } from "./webhook.js";

vi.mock("@issuectl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@issuectl/core")>();
  return {
    ...actual,
    getRepoWebhookConfigById: vi.fn(),
    listRepos: vi.fn(),
    listWebhookEvents: vi.fn(),
  };
});

vi.mock("../utils/db.js", () => ({
  requireDb: vi.fn(),
}));

const mockDb = {};

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 1,
    owner: "mean-weasel",
    name: "issuectl",
    localPath: null,
    branchPattern: null,
    autoLaunchIssues: true,
    autoReviewPrs: false,
    issueAgent: "claude",
    reviewAgent: "codex",
    webhookId: null,
    reviewPreamble: null,
    webhookPayloadMode: "metadata",
    createdAt: "2026-05-23T00:00:00.000Z",
    ...overrides,
  };
}

function makeWebhookEvent(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    id: 1,
    deliveryId: "delivery-1",
    repoId: 1,
    eventType: "issues",
    action: "opened",
    senderLogin: "octocat",
    targetType: "issue",
    targetNumber: 42,
    payloadJson: null,
    receivedAt: 1_000,
    intentId: null,
    ...overrides,
  };
}

function createProgram(): Command {
  const program = new Command();
  program.name("issuectl").exitOverride();
  registerWebhookCommands(program);
  return program;
}

async function parseCommand(args: string[]): Promise<string> {
  const program = createProgram();
  let stdout = "";
  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((value) => {
    stdout += String(value);
    return true;
  });

  try {
    await program.parseAsync(args, { from: "user" });
    return stdout;
  } finally {
    writeSpy.mockRestore();
  }
}

beforeEach(() => {
  vi.mocked(requireDb).mockReset();
  vi.mocked(requireDb).mockReturnValue(mockDb as never);
  vi.mocked(getRepoWebhookConfigById).mockReset();
  vi.mocked(listRepos).mockReset();
  vi.mocked(listWebhookEvents).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("webhook commands", () => {
  it("status prints secret state without printing the secret value", async () => {
    const repos = [
      makeRepo({ id: 1, owner: "mean-weasel", name: "issuectl" }),
      makeRepo({
        id: 2,
        owner: "mean-weasel",
        name: "issuectl-test",
        autoLaunchIssues: false,
        autoReviewPrs: true,
        webhookPayloadMode: "raw",
      }),
    ];
    vi.mocked(listRepos).mockReturnValue(repos);
    vi.mocked(getRepoWebhookConfigById).mockImplementation((_, id) => {
      const repo = repos.find((candidate) => candidate.id === id);
      if (!repo) return undefined;
      return {
        ...repo,
        webhookSecret: id === 1 ? "super-secret-webhook-value" : null,
      } satisfies RepoWebhookConfig;
    });

    const output = await parseCommand(["webhook", "status"]);

    expect(output).toContain("mean-weasel/issuectl");
    expect(output).toContain("secret=set");
    expect(output).toContain("mean-weasel/issuectl-test");
    expect(output).toContain("secret=missing");
    expect(output).not.toContain("super-secret-webhook-value");
  });

  it("tail with limit 1 prints the newest webhook event", async () => {
    vi.mocked(listWebhookEvents).mockReturnValue([
      makeWebhookEvent({
        id: 2,
        deliveryId: "newest",
        eventType: "pull_request",
        action: "synchronize",
        targetType: "pr",
        targetNumber: 17,
        receivedAt: 2_000,
      }),
    ]);

    const output = await parseCommand(["webhook", "tail", "--limit", "1"]);

    expect(listWebhookEvents).toHaveBeenCalledWith(mockDb, 1);
    expect(output).toContain("2\tpull_request\tsynchronize\tpr#17");
    expect(output).not.toContain("issues");
  });
});
