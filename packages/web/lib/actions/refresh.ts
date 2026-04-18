"use server";

import { getDb, clearCache, dbExists } from "@issuectl/core";
import { revalidateSafely } from "@/lib/revalidate";

export async function refreshAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    if (dbExists()) {
      const db = getDb();
      clearCache(db);
    }
  } catch (err) {
    console.error("[issuectl] refreshAction failed to clear cache:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to refresh",
    };
  }
  revalidateSafely("/", "/settings");
  return { success: true };
}
