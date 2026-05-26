import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Repo } from "@issuectl/core";

const getDb = vi.hoisted(() => vi.fn());
const getSetting = vi.hoisted(() => vi.fn());
const listRepos = vi.hoisted(() => vi.fn());
const recordDiagnosticEventSafely = vi.hoisted(() => vi.fn());
const withAuthRetry = vi.hoisted(() => vi.fn());
const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getSetting: (...args: unknown[]) => getSetting(...args),
  listRepos: (...args: unknown[]) => listRepos(...args),
  recordDiagnosticEventSafely: (...args: unknown[]) => recordDiagnosticEventSafely(...args),
  withAuthRetry: (...args: unknown[]) => withAuthRetry(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: logger,
}));

import {
  buildWebhookUrl,
  reconcileWebhookUrlsOnce,
} from "./webhook-url-reconciler";

const db = {};
const repo = {
  id: 1,
  owner: "mean-weasel",
  name: "issuectl",
  localPath: null,
  branchPattern: null,
  autoLaunchIssues: false,
  autoReviewPrs: false,
  issueAgent: "codex",
  reviewAgent: "codex",
  webhookId: 123,
  reviewPreamble: null,
  webhookPayloadMode: "metadata",
  createdAt: "2026-05-26T00:00:00.000Z",
} satisfies Repo;

beforeEach(() => {
  getDb.mockReturnValue(db);
  getSetting.mockReset();
  listRepos.mockReset();
  recordDiagnosticEventSafely.mockReset();
  withAuthRetry.mockReset();
  logger.info.mockReset();
  logger.warn.mockReset();
});

describe("webhook URL reconciler", () => {
  it("builds repo-scoped webhook URLs from the configured base URL", () => {
    expect(buildWebhookUrl("https://hooks.example.test/", 42)).toBe(
      "https://hooks.example.test/api/webhook/github/42",
    );
  });

  it("skips when no public webhook base URL is configured", async () => {
    const result = await reconcileWebhookUrlsOnce(db as never, {
      getBaseUrl: () => "",
      listConfiguredRepos: vi.fn(),
      reconcileWebhookUrl: vi.fn(),
    });

    expect(result).toEqual({
      checked: 0,
      updated: 0,
      failed: 0,
      skippedReason: "missing_base_url",
    });
  });

  it("skips repos without stored webhook ids", async () => {
    const reconcileWebhookUrl = vi.fn();
    const result = await reconcileWebhookUrlsOnce(db as never, {
      getBaseUrl: () => "https://hooks.example.test",
      listConfiguredRepos: () => [{ ...repo, webhookId: null }],
      reconcileWebhookUrl,
    });

    expect(result).toEqual({
      checked: 0,
      updated: 0,
      failed: 0,
      skippedReason: "no_configured_webhooks",
    });
    expect(reconcileWebhookUrl).not.toHaveBeenCalled();
  });

  it("updates drifted webhook URLs and records diagnostics", async () => {
    const reconcileWebhookUrl = vi.fn().mockResolvedValue({
      hookId: 123,
      previousUrl: "https://old.example.test/api/webhook/github/1",
      url: "https://hooks.example.test/api/webhook/github/1",
      updated: true,
    });

    const result = await reconcileWebhookUrlsOnce(db as never, {
      getBaseUrl: () => "https://hooks.example.test/",
      listConfiguredRepos: () => [repo],
      reconcileWebhookUrl,
      recordDiagnostic: recordDiagnosticEventSafely,
    });

    expect(result).toEqual({
      checked: 1,
      updated: 1,
      failed: 0,
      skippedReason: null,
    });
    expect(reconcileWebhookUrl).toHaveBeenCalledWith({
      owner: "mean-weasel",
      repo: "issuectl",
      hookId: 123,
      url: "https://hooks.example.test/api/webhook/github/1",
    });
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(db, expect.objectContaining({
      event: "webhook.url_reconciled",
      owner: "mean-weasel",
      repo: "issuectl",
      data: expect.objectContaining({
        hookId: 123,
        previousUrl: "https://old.example.test/api/webhook/github/1",
        url: "https://hooks.example.test/api/webhook/github/1",
      }),
    }));
  });

  it("does not record reconciliation diagnostics when URLs already match", async () => {
    const reconcileWebhookUrl = vi.fn().mockResolvedValue({
      hookId: 123,
      previousUrl: "https://hooks.example.test/api/webhook/github/1",
      url: "https://hooks.example.test/api/webhook/github/1",
      updated: false,
    });

    const result = await reconcileWebhookUrlsOnce(db as never, {
      getBaseUrl: () => "https://hooks.example.test",
      listConfiguredRepos: () => [repo],
      reconcileWebhookUrl,
      recordDiagnostic: recordDiagnosticEventSafely,
    });

    expect(result).toEqual({
      checked: 1,
      updated: 0,
      failed: 0,
      skippedReason: null,
    });
    expect(recordDiagnosticEventSafely).not.toHaveBeenCalled();
  });

  it("continues after a repo reconciliation failure", async () => {
    const reconcileWebhookUrl = vi
      .fn()
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce({
        hookId: 456,
        previousUrl: "https://old.example.test/api/webhook/github/2",
        url: "https://hooks.example.test/api/webhook/github/2",
        updated: true,
      });

    const result = await reconcileWebhookUrlsOnce(db as never, {
      getBaseUrl: () => "https://hooks.example.test",
      listConfiguredRepos: () => [
        repo,
        { ...repo, id: 2, name: "other", webhookId: 456 },
      ],
      reconcileWebhookUrl,
      recordDiagnostic: recordDiagnosticEventSafely,
    });

    expect(result).toEqual({
      checked: 2,
      updated: 1,
      failed: 1,
      skippedReason: null,
    });
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(db, expect.objectContaining({
      event: "webhook.url_reconcile_failed",
      owner: "mean-weasel",
      repo: "issuectl",
      data: expect.objectContaining({ hookId: 123, error: "not found" }),
    }));
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(db, expect.objectContaining({
      event: "webhook.url_reconciled",
      repo: "other",
    }));
  });
});
