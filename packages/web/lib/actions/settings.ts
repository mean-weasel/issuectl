"use server";

import { revalidatePath } from "next/cache";
import { getDb, setSetting } from "@issuectl/core";
import type { SettingKey } from "@issuectl/core";

const VALID_KEYS = [
  "branch_pattern",
  "terminal_app",
  "terminal_window_title",
  "terminal_tab_title_pattern",
  "cache_ttl",
  "worktree_dir",
] as const satisfies readonly SettingKey[];

export async function updateSetting(
  key: SettingKey,
  value: string,
): Promise<{ success: boolean; error?: string }> {
  if (!VALID_KEYS.includes(key)) {
    return { success: false, error: "Invalid setting key" };
  }
  if (!value.trim()) {
    return { success: false, error: "Value cannot be empty" };
  }
  if (key === "cache_ttl") {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      return { success: false, error: "Cache TTL must be a non-negative number" };
    }
  }

  try {
    const db = getDb();
    setSetting(db, key, value.trim());
  } catch (err) {
    console.error("[issuectl] Failed to update setting:", err);
    return { success: false, error: "Failed to update setting" };
  }
  try {
    revalidatePath("/settings");
  } catch (err) {
    console.warn("[issuectl] Cache revalidation failed (setting saved):", err);
  }
  return { success: true };
}
