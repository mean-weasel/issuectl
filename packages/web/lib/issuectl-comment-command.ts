import {
  asObject,
  getNumberProperty,
  getStringProperty,
} from "./github-webhook-utils";

export type IssuectlCommentAction = "launch" | "review" | "end";
export type IssuectlTargetType = "issue" | "pr";
export type IssuectlAgent = "claude" | "codex";
export type IssuectlCommentCommand = {
  kind: "command";
  action: IssuectlCommentAction;
  actor: string;
  targetType: IssuectlTargetType;
  targetNumber: number;
  agent: IssuectlAgent | null;
  full: boolean;
};
export type IssuectlCommentCommandResult =
  | IssuectlCommentCommand
  | { kind: "ignored"; reason: "not_command" | "unsupported_action" | "bot_author" | "unsupported_event" }
  | { kind: "denied"; reason: "launch_requires_issue" | "review_requires_pr" | "invalid_flags" | "missing_target" };

const COMMAND_RE = /^\/issuectl\s+(launch|review|end)(?:\s+(.*))?$/;
const SUPPORTED_EVENTS = new Set(["issue_comment", "pull_request_review_comment"]);

export function parseIssuectlCommentCommand(
  eventType: string,
  payload: unknown,
): IssuectlCommentCommandResult {
  if (!SUPPORTED_EVENTS.has(eventType)) return { kind: "ignored", reason: "unsupported_event" };
  const object = asObject(payload);
  if (!object) return { kind: "ignored", reason: "not_command" };
  const action = getStringProperty(object, "action");
  if (action !== "created") return { kind: "ignored", reason: "unsupported_action" };

  const comment = asObject(object?.comment);
  const body = getStringProperty(comment, "body")?.trim();
  const match = body?.match(COMMAND_RE);
  if (!match) return { kind: "ignored", reason: "not_command" };

  const sender = asObject(object?.sender);
  const commentUser = asObject(comment?.user);
  const actor = getStringProperty(commentUser, "login") ?? getStringProperty(sender, "login");
  const authorType = getStringProperty(commentUser, "type") ?? getStringProperty(sender, "type");
  if (!actor || authorType === "Bot" || actor.endsWith("[bot]")) {
    return { kind: "ignored", reason: "bot_author" };
  }

  const target = commandTarget(eventType, object);
  if (!target) return { kind: "denied", reason: "missing_target" };

  const commandAction = match[1] as IssuectlCommentAction;
  if (commandAction === "launch" && target.targetType !== "issue") {
    return { kind: "denied", reason: "launch_requires_issue" };
  }
  if (commandAction === "review" && target.targetType !== "pr") {
    return { kind: "denied", reason: "review_requires_pr" };
  }

  const flags = parseFlags(match[2] ?? "");
  if (!flags) return { kind: "denied", reason: "invalid_flags" };
  return {
    kind: "command",
    action: commandAction,
    actor,
    targetType: target.targetType,
    targetNumber: target.targetNumber,
    agent: flags.agent,
    full: flags.full,
  };
}

function commandTarget(
  eventType: string,
  payload: Record<string, unknown>,
): { targetType: IssuectlTargetType; targetNumber: number } | null {
  if (eventType === "pull_request_review_comment") {
    const pull = asObject(payload.pull_request);
    const number = pull ? getNumberProperty(pull, "number") : null;
    return number ? { targetType: "pr", targetNumber: number } : null;
  }
  const issue = asObject(payload.issue);
  const number = issue ? getNumberProperty(issue, "number") : null;
  if (!number) return null;
  return {
    targetType: asObject(issue?.pull_request) ? "pr" : "issue",
    targetNumber: number,
  };
}

function parseFlags(raw: string): { agent: IssuectlAgent | null; full: boolean } | null {
  const parts = raw.trim() === "" ? [] : raw.trim().split(/\s+/);
  let agent: IssuectlAgent | null = null;
  let full = false;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part === "--full") {
      full = true;
    } else if (part === "--agent" && (parts[i + 1] === "claude" || parts[i + 1] === "codex")) {
      agent = parts[i + 1] as IssuectlAgent;
      i += 1;
    } else {
      return null;
    }
  }
  return { agent, full };
}
