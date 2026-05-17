"use server";

import { getWorkbenchPayload } from "@/lib/workbench-data";

export async function refreshWorkbenchPayload() {
  return getWorkbenchPayload();
}
