"use server";

import { revalidatePath } from "next/cache";
import { getDb, getOctokit, getDashboardData } from "@issuectl/core";

export async function refreshDashboard(): Promise<void> {
  try {
    const db = getDb();
    const octokit = await getOctokit();
    await getDashboardData(db, octokit, { forceRefresh: true });
  } catch (err) {
    console.error("[issuectl] Dashboard refresh failed:", err);
  }
  revalidatePath("/");
}
