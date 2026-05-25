import { Command, CommanderError } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRepoWebhookConfigById,
  getSetting,
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
    getSetting: vi.fn(),
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
  vi.mocked(getSetting).mockReset();
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
    vi.mocked(getSetting).mockReturnValue("https://hooks.example.test");

    const result = await parseCommand(["webhook", "status"]);

    expect(result.stdout).toContain("mean-weasel/issuectl");
    expect(result.stdout).toContain("secret=set");
    expect(result.stdout).toContain("url=https://hooks.example.test/api/webhook/github/1");
    expect(result.stdout).toContain("mean-weasel/issuectl-test");
    expect(result.stdout).toContain("secret=missing");
    expect(result.stdout).not.toContain("super-secret-webhook-value");
  });

  it("status can show one tracked repo", async () => {
    const repos = [
      makeRepo({ id: 1, owner: "mean-weasel", name: "issuectl" }),
      makeRepo({ id: 2, owner: "mean-weasel", name: "other" }),
    ];
    vi.mocked(listRepos).mockReturnValue(repos);
    vi.mocked(getRepoWebhookConfigById).mockImplementation((_, id) => ({
      ...repos.find((repo) => repo.id === id)!,
      webhookSecret: null,
    }));

    const result = await parseCommand(["webhook", "status", "mean-weasel/issuectl"]);

    expect(result.stdout).toContain("mean-weasel/issuectl");
    expect(result.stdout).not.toContain("mean-weasel/other");
  });

  it("tail with default limit prints recent webhook events", async () => {
    vi.mocked(listWebhookEvents).mockReturnValue([makeWebhookEvent()]);

    await parseCommand(["webhook", "tail"]);

    expect(listWebhookEvents).toHaveBeenCalledWith(mockDb, {
      limit: 20,
      repoId: undefined,
      targetType: undefined,
      targetNumber: undefined,
    });
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

    expect(listWebhookEvents).toHaveBeenCalledWith(mockDb, {
      limit: 1,
      repoId: undefined,
      targetType: undefined,
      targetNumber: undefined,
    });
    expect(result.stdout).toContain("2\tpull_request\tsynchronize\tpr#17");
    expect(result.stdout).not.toContain("issues");
  });

  it("tail filters by repo and target", async () => {
    vi.mocked(listRepos).mockReturnValue([
      makeRepo({ id: 9, owner: "mean-weasel", name: "issuectl" }),
    ]);
    vi.mocked(listWebhookEvents).mockReturnValue([
      makeWebhookEvent({ repoId: 9, targetType: "issue", targetNumber: 506 }),
    ]);

    await parseCommand([
      "webhook",
      "tail",
      "--repo",
      "mean-weasel/issuectl",
      "--target",
      "issue#506",
    ]);

    expect(listWebhookEvents).toHaveBeenCalledWith(mockDb, {
      limit: 20,
      repoId: 9,
      targetType: "issue",
      targetNumber: 506,
    });
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

  it("rejects invalid tail target before opening the database", async () => {
    const result = await parseCommand(["webhook", "tail", "--target", "issue/506"]);

    expect(result.error).toBeInstanceOf(CommanderError);
    expect(result.stderr).toContain("--target must use issue#number or pr#number.");
    expect(requireDb).not.toHaveBeenCalled();
    expect(listWebhookEvents).not.toHaveBeenCalled();
  });
});
