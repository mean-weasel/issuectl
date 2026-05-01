import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  getSettings,
  setSetting,
  formatErrorForUser,
  validateClaudeArgs,
  validateCodexArgs,
  type SettingKey,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

const EDITABLE_KEYS: readonly SettingKey[] = [
  "branch_pattern",
  "cache_ttl",
  "worktree_dir",
  "launch_agent",
  "claude_extra_args",
  "codex_extra_args",
  "default_repo_id",
  "idle_grace_period",
  "idle_threshold",
];

function validateSettingValue(
  key: SettingKey,
  value: string,
): string | undefined {
  const trimmed = value.trim();
  if (key === "launch_agent" && trimmed !== "claude" && trimmed !== "codex") {
    return "Launch agent must be claude or codex";
  }
  if (key === "claude_extra_args") {
    const result = validateClaudeArgs(trimmed);
    return result.ok ? undefined : result.errors.join(" ");
  }
  if (key === "codex_extra_args") {
    const result = validateCodexArgs(trimmed);
    return result.ok ? undefined : result.errors.join(" ");
  }
  return undefined;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const db = getDb();
    const settings = getSettings(db);
    const filtered = settings.filter((s) => EDITABLE_KEYS.includes(s.key));
    return NextResponse.json({
      settings: Object.fromEntries(filtered.map((s) => [s.key, s.value])),
    });
  } catch (err) {
    log.error({ err, msg: "api_settings_get_failed" });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  const keys = Object.keys(body);
  if (keys.length === 0) {
    return NextResponse.json({ error: "No settings provided" }, { status: 400 });
  }

  for (const key of keys) {
    if (!EDITABLE_KEYS.includes(key as SettingKey)) {
      return NextResponse.json(
        { error: `Invalid setting key: ${key}` },
        { status: 400 },
      );
    }
    if (typeof body[key] !== "string") {
      return NextResponse.json(
        { error: `Value for "${key}" must be a string` },
        { status: 400 },
      );
    }
    const validationError = validateSettingValue(key as SettingKey, body[key]);
    if (validationError) {
      return NextResponse.json(
        { error: `${key}: ${validationError}` },
        { status: 400 },
      );
    }
  }

  try {
    const db = getDb();
    for (const key of keys) {
      setSetting(db, key as SettingKey, body[key].trim());
    }
    log.info({ msg: "api_settings_updated", keys });
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err, msg: "api_settings_update_failed" });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
