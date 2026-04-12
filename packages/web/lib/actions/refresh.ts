"use server";

import {
  getDb,
  getDashboardData,
  withAuthRetry,
  formatErrorForUser,
} from "@issuectl/core";
import { revalidateSafely } from "@/lib/revalidate";

export async function refreshDashboard(): Promise<{
  success: boolean;
  error?: string;
  cacheStale?: true;
}> {
  try {
    const db = getDb();
    await withAuthRetry((octokit) =>
      getDashboardData(db, octokit, { forceRefresh: true }),
    );
  } catch (err) {
    console.error("[issuectl] Dashboard refresh failed:", err);
    return { success: false, error: formatErrorForUser(err) };
  }
  const { stale } = revalidateSafely("/");
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}
