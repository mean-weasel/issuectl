import type {
  CommentPayload,
  CreateIssuePayload,
  CreatePrPayload,
  LabelPayload,
  PushPayload,
} from "./mutation-types";

export function parseCommentPayload(payload: unknown): CommentPayload | undefined {
  if (!isRecord(payload) || !nonEmptyString(payload.body)) return undefined;
  return { body: payload.body };
}

export function parseLabelPayload(payload: unknown): LabelPayload | undefined {
  if (!isRecord(payload) || !nonEmptyString(payload.label)) return undefined;
  if (payload.operation !== undefined && payload.operation !== "add" && payload.operation !== "remove") {
    return undefined;
  }
  return { label: payload.label, operation: payload.operation };
}

export function parseCreateIssuePayload(payload: unknown): CreateIssuePayload | undefined {
  if (!isRecord(payload) || !nonEmptyString(payload.title)) return undefined;
  if (payload.body !== undefined && typeof payload.body !== "string") return undefined;
  return { title: payload.title, body: payload.body };
}

export function parseCreatePrPayload(payload: unknown): CreatePrPayload | undefined {
  if (
    !isRecord(payload) ||
    !nonEmptyString(payload.title) ||
    !nonEmptyString(payload.head) ||
    !nonEmptyString(payload.base)
  ) {
    return undefined;
  }
  if (payload.body !== undefined && typeof payload.body !== "string") return undefined;
  return {
    title: payload.title,
    head: payload.head,
    base: payload.base,
    body: payload.body,
  };
}

export function parsePushPayload(payload: unknown): PushPayload | undefined {
  if (
    !isRecord(payload) ||
    !nonEmptyString(payload.expectedHeadRef) ||
    !nonEmptyString(payload.expectedHeadSha) ||
    !nonEmptyString(payload.newSha)
  ) {
    return undefined;
  }
  return {
    expectedHeadRef: payload.expectedHeadRef,
    expectedHeadSha: payload.expectedHeadSha,
    newSha: payload.newSha,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
