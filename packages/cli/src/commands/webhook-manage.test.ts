import { Command, CommanderError } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRepoWebhookConfigById,
  getSetting,
  listRepos,
  updateRepoWebhookSettings,
  withAuthRetry,
} from "@issuectl/core";
import { confirm } from "@inquirer/prompts";
import { requireDb } from "../utils/db.js";
import { registerWebhookCommands } from "./webhook.js";

vi.mock("@inquirer/prompts", () => ({ confirm: vi.fn() }));
vi.mock("@issuectl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@issuectl/core")>();
  return {
    ...actual,
    getRepoWebhookConfigById: vi.fn(),
    getSetting: vi.fn(),
    listRepos: vi.fn(),
    updateRepoWebhookSettings: vi.fn(),
    withAuthRetry: vi.fn(),
  };
});
vi.mock("../utils/db.js", () => ({ requireDb: vi.fn() }));

const db = {};
const createWebhook = vi.fn(async () => ({ data: { id: 123 } }));
const updateWebhook = vi.fn(async () => ({ data: { id: 456 } }));
const octokit = {
  rest: {
    repos: { createWebhook, updateWebhook },
    users: { getAuthenticated: vi.fn(async () => ({ data: { login: "octocat" } })) },
  },
};
const repo = {
  id: 7,
  owner: "mean-weasel",
  name: "issuectl",
  localPath: null,
  branchPattern: null,
  autoLaunchIssues: true,
  autoReviewPrs: true,
  issueAgent: "claude",
  reviewAgent: "codex",
  webhookId: null,
  reviewPreamble: null,
  webhookPayloadMode: "metadata",
  createdAt: "2026-05-24T00:00:00.000Z",
};

async function parseCommand(args: string[]) {
  const program = new Command()
    .exitOverride()
    .configureOutput({ writeErr: () => undefined });
  let stdout = "";
  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((value) => {
    stdout += String(value);
    return true;
  });
  registerWebhookCommands(program);
  try {
    await program.parseAsync(args, { from: "user" });
    return { stdout };
  } catch (error) {
    return { error, stdout };
  } finally {
    writeSpy.mockRestore();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireDb).mockReturnValue(db as never);
  vi.mocked(listRepos).mockReturnValue([repo as never]);
  vi.mocked(getRepoWebhookConfigById).mockReturnValue({ ...repo, webhookSecret: null } as never);
  vi.mocked(getSetting).mockReturnValue("https://hooks.example.test");
  vi.mocked(withAuthRetry).mockImplementation((fn: (input: never) => Promise<unknown>) =>
    fn(octokit as never),
  );
  vi.mocked(confirm).mockResolvedValue(true);
  vi.mocked(updateRepoWebhookSettings).mockReset();
});

describe("webhook management commands", () => {
  it("creates a webhook with confirmation and never prints the generated secret", async () => {
    const result = await parseCommand(["webhook", "create", "mean-weasel/issuectl"]);

    expect(result.error).toBeUndefined();
    expect(confirm).toHaveBeenCalled();
    expect(createWebhook).toHaveBeenCalledWith(expect.objectContaining({
      owner: "mean-weasel",
      repo: "issuectl",
      config: expect.objectContaining({
        url: "https://hooks.example.test/api/webhook/github/7",
        secret: expect.any(String),
      }),
    }));
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(db, 7, {
      webhookId: 123,
      webhookSecret: expect.any(String),
    });
    expect(result.stdout).toContain("hook_id=123");
    expect(result.stdout).not.toContain(
      vi.mocked(updateRepoWebhookSettings).mock.calls[0]?.[2]?.webhookSecret ?? "missing",
    );
  });

  it("rotates an existing stored webhook id with --yes", async () => {
    vi.mocked(getRepoWebhookConfigById).mockReturnValue({
      ...repo,
      webhookId: 456,
      webhookSecret: "old-secret",
    } as never);

    const result = await parseCommand(["webhook", "rotate", "mean-weasel/issuectl", "--yes"]);

    expect(result.error).toBeUndefined();
    expect(confirm).not.toHaveBeenCalled();
    expect(updateWebhook).toHaveBeenCalledWith(expect.objectContaining({ hook_id: 456 }));
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(db, 7, {
      webhookId: 456,
      webhookSecret: expect.any(String),
    });
    expect(result.stdout).not.toContain("old-secret");
  });

  it("rotates an existing stored webhook id through webhook secret rotate alias", async () => {
    vi.mocked(getRepoWebhookConfigById).mockReturnValue({
      ...repo,
      webhookId: 456,
      webhookSecret: "old-secret",
    } as never);

    const result = await parseCommand(["webhook", "secret", "rotate", "mean-weasel/issuectl", "--yes"]);

    expect(result.error).toBeUndefined();
    expect(confirm).not.toHaveBeenCalled();
    expect(updateWebhook).toHaveBeenCalledWith(expect.objectContaining({ hook_id: 456 }));
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(db, 7, {
      webhookId: 456,
      webhookSecret: expect.any(String),
    });
    expect(result.stdout).not.toContain("old-secret");
  });

  it("rejects create when public webhook base URL is missing", async () => {
    vi.mocked(getSetting).mockReturnValue(undefined);

    const result = await parseCommand(["webhook", "create", "mean-weasel/issuectl", "--yes"]);

    expect(result.error).toBeInstanceOf(CommanderError);
    expect(createWebhook).not.toHaveBeenCalled();
    expect(updateRepoWebhookSettings).not.toHaveBeenCalled();
  });
});
