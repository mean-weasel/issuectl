import { describe, expect, it, vi } from "vitest";
import type { Octokit } from "@octokit/rest";
import {
  createIssuectlWebhook,
  rotateIssuectlWebhook,
} from "./webhooks.js";

function makeOctokit() {
  const getAuthenticated = vi.fn(async () => ({ data: { login: "octocat" } }));
  const createWebhook = vi.fn(async () => ({ data: { id: 123 } }));
  const updateWebhook = vi.fn(async () => ({ data: { id: 456 } }));
  return {
    octokit: {
      rest: {
        users: { getAuthenticated },
        repos: { createWebhook, updateWebhook },
      },
    } as unknown as Octokit,
    createWebhook,
    getAuthenticated,
    updateWebhook,
  };
}

describe("GitHub webhook management", () => {
  it("creates the issuectl webhook with expected events and secret config", async () => {
    const { octokit, createWebhook, getAuthenticated } = makeOctokit();

    await expect(createIssuectlWebhook(octokit, {
      owner: "mean-weasel",
      repo: "issuectl",
      url: "https://hooks.example.test/api/webhook/github/1",
      secret: "generated-secret",
    })).resolves.toEqual({ id: 123, createdBy: "octocat" });

    expect(getAuthenticated).toHaveBeenCalled();
    expect(createWebhook).toHaveBeenCalledWith(expect.objectContaining({
      owner: "mean-weasel",
      repo: "issuectl",
      active: true,
      events: ["issues", "issue_comment", "pull_request", "pull_request_review_comment"],
      config: {
        url: "https://hooks.example.test/api/webhook/github/1",
        content_type: "json",
        secret: "generated-secret",
        insecure_ssl: "0",
      },
    }));
  });

  it("rotates an existing issuectl webhook secret with updateWebhook", async () => {
    const { octokit, updateWebhook } = makeOctokit();

    await expect(rotateIssuectlWebhook(octokit, {
      owner: "mean-weasel",
      repo: "issuectl",
      hookId: 456,
      url: "https://hooks.example.test/api/webhook/github/1",
      secret: "new-secret",
    })).resolves.toEqual({ id: 456, createdBy: "octocat" });

    expect(updateWebhook).toHaveBeenCalledWith(expect.objectContaining({
      hook_id: 456,
      config: expect.objectContaining({ secret: "new-secret" }),
    }));
  });
});
