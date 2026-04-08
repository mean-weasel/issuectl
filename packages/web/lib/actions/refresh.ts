"use server";

import { revalidatePath } from "next/cache";
import { getDb, getOctokit, getDashboardData } from "@issuectl/core";

export async function refreshDashboard(): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb();
    const octokit = await getOctokit();
    await getDashboardData(db, octokit, { forceRefresh: true });
  } catch (err) {
    console.error("[issuectl] Dashboard refresh failed:", err);
    return { success: false, error: "Failed to refresh dashboard data" };
  }
  revalidatePath("/");
  return { success: true };
}
