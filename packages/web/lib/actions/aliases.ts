"use server";

import { revalidatePath } from "next/cache";
import {
  getDb,
  addAlias as coreAddAlias,
  removeAlias as coreRemoveAlias,
  setDefaultAlias as coreSetDefault,
  clearDefaultAlias as coreClearDefault,
} from "@issuectl/core";

export async function addAlias(
  command: string,
  description: string,
): Promise<{ success: boolean; id?: number; error?: string }> {
  const cmd = command.trim();
  if (!cmd) {
    return { success: false, error: "Command is required" };
  }

  try {
    const db = getDb();
    const alias = coreAddAlias(db, cmd, description.trim());
    revalidatePath("/settings");
    return { success: true, id: alias.id };
  } catch (err) {
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      return { success: false, error: "An alias with that command already exists" };
    }
    console.error("[issuectl] Failed to add alias:", err);
    return { success: false, error: "Failed to add alias" };
  }
}

export async function removeAlias(
  id: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb();
    coreRemoveAlias(db, id);
  } catch (err) {
    console.error("[issuectl] Failed to remove alias:", err);
    return { success: false, error: "Failed to remove alias" };
  }
  revalidatePath("/settings");
  return { success: true };
}

export async function setDefaultAlias(
  id: number | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb();
    if (id === null) {
      coreClearDefault(db);
    } else {
      coreSetDefault(db, id);
    }
  } catch (err) {
    console.error("[issuectl] Failed to set default alias:", err);
    return { success: false, error: "Failed to set default alias" };
  }
  revalidatePath("/settings");
  return { success: true };
}
