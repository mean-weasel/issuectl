"use server";

import { revalidatePath } from "next/cache";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import {
  getDb,
  addRepo as coreAddRepo,
  removeRepo as coreRemoveRepo,
  updateRepo as coreUpdateRepo,
} from "@issuectl/core";

function expandHome(p: string): string {
  return p.startsWith("~") ? p.replace("~", homedir()) : p;
}

export async function addRepo(
  owner: string,
  name: string,
  localPath?: string,
): Promise<{ success: boolean; warning?: string; error?: string }> {
  if (!owner || !name) {
    return { success: false, error: "Owner and repo name are required" };
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(owner) || !/^[a-zA-Z0-9._-]+$/.test(name)) {
    return { success: false, error: "Invalid owner/repo format" };
  }

  try {
    const db = getDb();
    coreAddRepo(db, { owner, name, localPath });
  } catch (err) {
    console.error("[issuectl] Failed to add repo:", err);
    const msg =
      err instanceof Error && err.message.includes("UNIQUE")
        ? "Repository already tracked"
        : "Failed to add repository";
    return { success: false, error: msg };
  }
  revalidatePath("/settings");
  revalidatePath("/");

  if (localPath) {
    const exists = await stat(expandHome(localPath)).catch(() => null);
    if (!exists) {
      return { success: true, warning: "Local path does not exist — will prompt to clone on launch" };
    }
  }

  return { success: true };
}

export async function removeRepo(
  id: number,
): Promise<{ success: boolean; error?: string }> {
  if (!id || id <= 0) {
    return { success: false, error: "Invalid repo ID" };
  }

  try {
    const db = getDb();
    coreRemoveRepo(db, id);
  } catch (err) {
    console.error("[issuectl] Failed to remove repo:", err);
    return { success: false, error: "Failed to remove repository" };
  }
  revalidatePath("/settings");
  revalidatePath("/");
  return { success: true };
}

export async function updateRepo(
  id: number,
  updates: { localPath?: string; branchPattern?: string },
): Promise<{ success: boolean; error?: string }> {
  if (!id || id <= 0) {
    return { success: false, error: "Invalid repo ID" };
  }

  try {
    const db = getDb();
    coreUpdateRepo(db, id, updates);
  } catch (err) {
    console.error("[issuectl] Failed to update repo:", err);
    return { success: false, error: "Failed to update repository" };
  }
  revalidatePath("/settings");
  return { success: true };
}
