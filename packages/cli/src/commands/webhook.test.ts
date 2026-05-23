import { Command, CommanderError } from "commander";
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

function createProgram(): { program: Command; stderr: () => string } {
  let stderr = "";
  const program = new Command();
  program
    .name("issuectl")
    .exitOverride()
    .configureOutput({
      writeErr: (value) => {
        stderr += value;
      },
    });
  registerWebhookCommands(program);
  return { program, stderr: () => stderr };
}

async function parseCommand(args: string[]): Promise<{
  error?: unknown;
  stderr: string;
  stdout: string;
}> {
  const { program, stderr } = createProgram();
  let stdout = "";
  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((value) => {
    stdout += String(value);
    return true;
  });

  try {
    await program.parseAsync(args, { from: "user" });
    return { stderr: stderr(), stdout };
  } catch (error) {
    return { error, stderr: stderr(), stdout };
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

    const result = await parseCommand(["webhook", "status"]);

    expect(result.stdout).toContain("mean-weasel/issuectl");
    expect(result.stdout).toContain("secret=set");
    expect(result.stdout).toContain("mean-weasel/issuectl-test");
    expect(result.stdout).toContain("secret=missing");
    expect(result.stdout).not.toContain("super-secret-webhook-value");
  });

  it("tail with default limit prints recent webhook events", async () => {
    vi.mocked(listWebhookEvents).mockReturnValue([makeWebhookEvent()]);

    await parseCommand(["webhook", "tail"]);

    expect(listWebhookEvents).toHaveBeenCalledWith(mockDb, 20);
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

    const result = await parseCommand(["webhook", "tail", "--limit", "1"]);

    expect(listWebhookEvents).toHaveBeenCalledWith(mockDb, 1);
    expect(result.stdout).toContain("2\tpull_request\tsynchronize\tpr#17");
    expect(result.stdout).not.toContain("issues");
  });

  it.each([
    ["non-numeric", "abc"],
    ["zero", "0"],
    ["decimal", "1.5"],
    ["unsafe integer", "9007199254740992"],
  ])("rejects %s tail limit before opening the database", async (_, limit) => {
    const result = await parseCommand(["webhook", "tail", "--limit", limit]);

    expect(result.error).toBeInstanceOf(CommanderError);
    expect(result.stderr).toContain("--limit must be a positive integer.");
    expect(result.stderr).not.toContain("at ");
    expect(requireDb).not.toHaveBeenCalled();
    expect(listWebhookEvents).not.toHaveBeenCalled();
  });
});
