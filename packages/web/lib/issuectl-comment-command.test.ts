import { describe, expect, it } from "vitest";
import { parseIssuectlCommentCommand } from "./issuectl-comment-command.js";

const sender = { login: "octocat", type: "User" };

describe("parseIssuectlCommentCommand", () => {
  it("parses issue launch commands with agent flags", () => {
    const result = parseIssuectlCommentCommand("issue_comment", {
      action: "created",
      sender,
      comment: { body: "/issuectl launch --agent codex", user: sender },
      issue: { number: 506 },
    });

    expect(result).toEqual({
      kind: "command",
      action: "launch",
      actor: "octocat",
      targetType: "issue",
      targetNumber: 506,
      agent: "codex",
      full: false,
    });
  });

  it("parses PR review commands from review comments", () => {
    const result = parseIssuectlCommentCommand("pull_request_review_comment", {
      action: "created",
      sender,
      comment: { body: "/issuectl review --full --agent claude", user: sender },
      pull_request: { number: 44 },
    });

    expect(result).toEqual(expect.objectContaining({
      kind: "command",
      action: "review",
      targetType: "pr",
      targetNumber: 44,
      agent: "claude",
      full: true,
    }));
  });

  it("ignores edited comments and bot authors", () => {
    expect(parseIssuectlCommentCommand("issue_comment", {
      action: "edited",
      sender,
      comment: { body: "/issuectl launch", user: sender },
      issue: { number: 1 },
    })).toEqual({ kind: "ignored", reason: "unsupported_action" });

    expect(parseIssuectlCommentCommand("issue_comment", {
      action: "created",
      sender: { login: "github-actions[bot]", type: "Bot" },
      comment: { body: "/issuectl launch", user: { login: "github-actions[bot]", type: "Bot" } },
      issue: { number: 1 },
    })).toEqual({ kind: "ignored", reason: "bot_author" });
  });

  it("rejects commands bound to the wrong target kind", () => {
    expect(parseIssuectlCommentCommand("issue_comment", {
      action: "created",
      sender,
      comment: { body: "/issuectl review", user: sender },
      issue: { number: 506 },
    })).toEqual({ kind: "denied", reason: "review_requires_pr" });

    expect(parseIssuectlCommentCommand("issue_comment", {
      action: "created",
      sender,
      comment: { body: "/issuectl launch", user: sender },
      issue: { number: 44, pull_request: {} },
    })).toEqual({ kind: "denied", reason: "launch_requires_issue" });
  });
});
