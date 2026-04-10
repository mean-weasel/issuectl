"use server";

import { revalidatePath } from "next/cache";
import { getDb, setSetting, validateClaudeArgs } from "@issuectl/core";
import type { SettingKey } from "@issuectl/core";

const VALID_KEYS = [
  "branch_pattern",
  "terminal_app",
  "terminal_window_title",
  "terminal_tab_title_pattern",
  "cache_ttl",
  "worktree_dir",
  "claude_extra_args",
] as const satisfies readonly SettingKey[];

const ALLOW_EMPTY = new Set<SettingKey>(["claude_extra_args"]);

export type UpdateSettingResult = {
  success: boolean;
  error?: string;
  /** True when the write succeeded but the Next.js RSC cache could not be
   * invalidated. The caller should prompt the user to reload the page. */
  cacheStale?: boolean;
};

function describeDbError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  const message = err instanceof Error ? err.message : String(err);
  switch (code) {
    case "SQLITE_BUSY":
    case "SQLITE_LOCKED":
      return "Database is busy (another issuectl process may be using it). Try again in a moment.";
    case "SQLITE_READONLY":
    case "SQLITE_CANTOPEN":
      return "Cannot write to the issuectl database. Check ~/.issuectl/ file permissions or re-run `issuectl init`.";
    case "SQLITE_FULL":
      return "Disk is full — cannot write to the issuectl database.";
    case "SQLITE_CORRUPT":
      return "Database file is corrupted. Restore from backup or re-run `issuectl init`.";
    default:
      return `Failed to update setting: ${message}`;
  }
}

function validateOne(
  key: SettingKey,
  value: string,
): { ok: true; trimmed: string } | { ok: false; error: string } {
  if (!VALID_KEYS.includes(key)) {
    return { ok: false, error: "Invalid setting key" };
  }
  const trimmed = value.trim();
  if (trimmed === "" && !ALLOW_EMPTY.has(key)) {
    return { ok: false, error: "Value cannot be empty" };
  }
  if (key === "cache_ttl") {
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) {
      return { ok: false, error: "Cache TTL must be a non-negative number" };
    }
  }
  if (key === "claude_extra_args") {
    const result = validateClaudeArgs(trimmed);
    if (!result.ok) {
      return { ok: false, error: result.errors.join(" ") };
    }
  }
  return { ok: true, trimmed };
}

function revalidateSafely(): { stale: boolean } {
  try {
    revalidatePath("/settings");
    return { stale: false };
  } catch (err) {
    console.warn("[issuectl] Cache revalidation failed (setting saved)", err);
    return { stale: true };
  }
}

export async function updateSetting(
  key: SettingKey,
  value: string,
): Promise<UpdateSettingResult> {
  const validation = validateOne(key, value);
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  try {
    const db = getDb();
    setSetting(db, key, validation.trimmed);
  } catch (err) {
    console.error("[issuectl] Failed to update setting", { key, err });
    return { success: false, error: describeDbError(err) };
  }

  const { stale } = revalidateSafely();
  return { success: true, ...(stale ? { cacheStale: true } : {}) };
}

export async function updateSettings(
  updates: Partial<Record<SettingKey, string>>,
): Promise<UpdateSettingResult> {
  const entries = Object.entries(updates) as [SettingKey, string][];
  if (entries.length === 0) {
    return { success: true };
  }

  // Validate all keys BEFORE touching the DB so partial writes are impossible.
  const validated: [SettingKey, string][] = [];
  for (const [key, value] of entries) {
    const validation = validateOne(key, value);
    if (!validation.ok) {
      return { success: false, error: `${key}: ${validation.error}` };
    }
    validated.push([key, validation.trimmed]);
  }

  // Single DB transaction: all writes commit together or none do.
  try {
    const db = getDb();
    const txn = db.transaction((pairs: [SettingKey, string][]) => {
      for (const [key, trimmed] of pairs) {
        setSetting(db, key, trimmed);
      }
    });
    txn(validated);
  } catch (err) {
    console.error("[issuectl] Failed to update settings batch", { err });
    return { success: false, error: describeDbError(err) };
  }

  const { stale } = revalidateSafely();
  return { success: true, ...(stale ? { cacheStale: true } : {}) };
}
