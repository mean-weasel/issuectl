import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getGhToken,
  uploadImageToGitHub,
  formatErrorForUser,
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

const OWNER_REPO_RE = /^[\w.-]+$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_image_upload_parse_failed" });
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const owner = formData.get("owner");
  const repo = formData.get("repo");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (typeof owner !== "string" || !OWNER_REPO_RE.test(owner)) {
    return NextResponse.json({ error: "Invalid or missing owner" }, { status: 400 });
  }
  if (typeof repo !== "string" || !OWNER_REPO_RE.test(repo)) {
    return NextResponse.json({ error: "Invalid or missing repo" }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Only PNG, JPG, GIF, and WEBP images are supported" },
      { status: 400 },
    );
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json(
      { error: "Image must be 10 MB or smaller" },
      { status: 400 },
    );
  }

  try {
    const token = await getGhToken();
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadImageToGitHub(token, owner, repo, {
      name: file.name,
      type: file.type,
      data: buffer,
    });

    log.info({ msg: "api_image_uploaded", owner, repo, fileName: file.name });
    return NextResponse.json({ url: result.url });
  } catch (err) {
    log.error({ err, msg: "api_image_upload_failed", owner, repo });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
