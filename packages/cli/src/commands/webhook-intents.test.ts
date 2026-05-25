import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dropWebhookIntent,
  fireWebhookIntent,
  listRepos,
  listWebhookIntents,
  type Repo,
  type WebhookIntent,
} from "@issuectl/core";
import { requireDb } from "../utils/db.js";
import { registerWebhookCommands } from "./webhook.js";

vi.mock("@issuectl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@issuectl/core")>();
  return {
    ...actual,
    dropWebhookIntent: vi.fn(),
    fireWebhookIntent: vi.fn(),
    listWebhookIntents: vi.fn(),
    listRepos: vi.fn(),
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

function makeWebhookIntent(overrides: Partial<WebhookIntent> = {}): WebhookIntent {
  return {
    id: 1,
    repoId: 1,
    targetType: "issue",
    targetNumber: 506,
    firstSignalAt: 1_000,
    lastSignalAt: 1_000,
    scheduledAt: 2_000,
    processingStartedAt: null,
    leaseExpiresAt: null,
    generation: 1,
    desiredHeadSha: null,
    requestedAgent: null,
    reviewMode: null,
    signalCount: 1,
    status: "pending",
    resolvedAt: null,
    deploymentId: null,
    failureReason: null,
    ...overrides,
  };
}

function createProgram(): Command {
  const program = new Command();
  program
    .name("issuectl")
    .exitOverride();
  registerWebhookCommands(program);
  return program;
}

async function parseCommand(args: string[]): Promise<string> {
  let stdout = "";
  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((value) => {
    stdout += String(value);
    return true;
  });

  try {
    await createProgram().parseAsync(args, { from: "user" });
    return stdout;
  } finally {
    writeSpy.mockRestore();
  }
}

beforeEach(() => {
  vi.mocked(requireDb).mockReset();
  vi.mocked(requireDb).mockReturnValue(mockDb as never);
  vi.mocked(dropWebhookIntent).mockReset();
  vi.mocked(fireWebhookIntent).mockReset();
  vi.mocked(listWebhookIntents).mockReset();
  vi.mocked(listRepos).mockReset();
});

describe("webhook intent commands", () => {
  it("lists webhook intents with DB-level filters", async () => {
    vi.mocked(listRepos).mockReturnValue([
      makeRepo({ id: 9, owner: "mean-weasel", name: "issuectl" }),
    ]);
    vi.mocked(listWebhookIntents).mockReturnValue([
      makeWebhookIntent({ id: 7, repoId: 9, targetType: "pr", targetNumber: 44, status: "deferred" }),
    ]);

    const stdout = await parseCommand([
      "webhook",
      "intents",
      "--repo",
      "mean-weasel/issuectl",
      "--target",
      "pr#44",
      "--status",
      "active",
    ]);

    expect(listWebhookIntents).toHaveBeenCalledWith(mockDb, {
      limit: 20,
      repoId: 9,
      targetType: "pr",
      targetNumber: 44,
      status: "active",
    });
    expect(stdout).toContain("7\tmean-weasel/issuectl\tpr#44\tdeferred");
  });

  it("fires a pending webhook intent immediately", async () => {
    vi.mocked(fireWebhookIntent).mockReturnValue(makeWebhookIntent({ id: 7, scheduledAt: 1234 }));

    const stdout = await parseCommand(["webhook", "intent", "fire", "7", "--yes"]);

    expect(fireWebhookIntent).toHaveBeenCalledWith(mockDb, 7, expect.any(Number));
    expect(stdout).toContain("7\tissue#506\tpending");
  });

  it("drops an active webhook intent with a reason", async () => {
    vi.mocked(dropWebhookIntent).mockReturnValue(makeWebhookIntent({
      id: 8,
      status: "expired",
      failureReason: "operator_test",
    }));

    const stdout = await parseCommand(["webhook", "intent", "drop", "8", "--yes", "--reason", "operator_test"]);

    expect(dropWebhookIntent).toHaveBeenCalledWith(mockDb, 8, expect.any(Number), "operator_test");
    expect(stdout).toContain("8\tissue#506\texpired\treason=operator_test");
  });
});
