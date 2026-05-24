import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addRepo,
  getRepo,
  updateRepo,
  updateRepoWebhookSettings,
  type Repo,
} from "@issuectl/core";
import { requireDb } from "../utils/db.js";
import { repoAddCommand, repoShowCommand, repoUpdateCommand } from "./repo.js";

vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(),
  input: vi.fn(async () => ""),
}));

vi.mock("@issuectl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@issuectl/core")>();
  return {
    ...actual,
    addRepo: vi.fn(),
    getRepo: vi.fn(),
    updateRepo: vi.fn(),
    updateRepoWebhookSettings: vi.fn(),
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
    autoLaunchIssues: false,
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

beforeEach(() => {
  vi.mocked(requireDb).mockReturnValue(mockDb as never);
  vi.mocked(addRepo).mockReset();
  vi.mocked(getRepo).mockReset();
  vi.mocked(updateRepo).mockReset();
  vi.mocked(updateRepoWebhookSettings).mockReset();
});

describe("repo commands", () => {
  it("adds a repo with webhook automation flags", async () => {
    vi.mocked(getRepo).mockReturnValue(undefined);
    vi.mocked(addRepo).mockReturnValue(makeRepo());
    vi.mocked(updateRepoWebhookSettings).mockReturnValue(makeRepo({
      autoLaunchIssues: true,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    }));

    await repoAddCommand("mean-weasel/issuectl", {
      autoLaunchIssues: true,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    });

    expect(addRepo).toHaveBeenCalledWith(mockDb, {
      owner: "mean-weasel",
      name: "issuectl",
      localPath: undefined,
    });
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(mockDb, 1, {
      autoLaunchIssues: true,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    });
  });

  it("updates webhook automation settings on an existing repo", async () => {
    vi.mocked(getRepo).mockReturnValue(makeRepo());
    vi.mocked(updateRepoWebhookSettings).mockReturnValue(makeRepo({
      autoLaunchIssues: true,
      autoReviewPrs: false,
      issueAgent: "codex",
    }));

    await repoUpdateCommand("mean-weasel/issuectl", {
      autoLaunchIssues: true,
      autoReviewPrs: false,
      issueAgent: "codex",
    });

    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(mockDb, 1, {
      autoLaunchIssues: true,
      autoReviewPrs: false,
      issueAgent: "codex",
    });
  });

  it("shows webhook configuration without secrets", () => {
    vi.mocked(getRepo).mockReturnValue(makeRepo({
      autoLaunchIssues: true,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "claude",
      webhookPayloadMode: "raw",
    }));
    let stderr = "";
    const spy = vi.spyOn(console, "error").mockImplementation((value?: unknown) => {
      stderr += `${String(value)}\n`;
    });

    repoShowCommand("mean-weasel/issuectl");

    expect(stderr).toContain("auto-launch issues: true");
    expect(stderr).toContain("auto-review PRs: true");
    expect(stderr).toContain("issue agent: codex");
    expect(stderr).toContain("review agent: claude");
    expect(stderr).toContain("payload mode: raw");
    expect(stderr).not.toContain("secret");
    spy.mockRestore();
  });
});
