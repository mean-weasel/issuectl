import { getDb, getSetting } from "@issuectl/core";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export function validateApiToken(headers: Headers): boolean {
  const authHeader = headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const provided = authHeader.slice(7);
  const db = getDb();
  const stored = getSetting(db, "api_token");
  if (!stored) return false;

  if (provided.length !== stored.length) return false;
  return timingSafeEqual(
    Buffer.from(provided),
    Buffer.from(stored),
  );
}

export function requireAuth(request: NextRequest): NextResponse | null {
  if (!validateApiToken(request.headers)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }
  return null;
}
