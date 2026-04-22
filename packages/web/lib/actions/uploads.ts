"use server";

import {
  uploadImageToGitHub,
  getGhToken,
  formatErrorForUser,
} from "@issuectl/core";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export async function uploadImage(
  formData: FormData,
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  const file = formData.get("file");
  const owner = formData.get("owner");
  const repo = formData.get("repo");

  if (!(file instanceof File)) {
    return { success: false, error: "No file provided" };
  }
  if (typeof owner !== "string" || !/^[\w.-]+$/.test(owner) ||
      typeof repo !== "string" || !/^[\w.-]+$/.test(repo)) {
    return { success: false, error: "Missing repository context" };
  }
  if (file.size > MAX_SIZE) {
    return { success: false, error: "Image must be 10 MB or smaller" };
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return { success: false, error: "Only PNG, JPG, GIF, and WEBP images are supported" };
  }

  try {
    const token = await getGhToken();
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadImageToGitHub(token, owner, repo, {
      name: file.name,
      type: file.type,
      data: buffer,
    });
    return { success: true, url: result.url };
  } catch (err) {
    console.error("[issuectl] Image upload failed:", err);
    return { success: false, error: formatErrorForUser(err) };
  }
}
