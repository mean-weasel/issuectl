import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb, getSetting } from "@issuectl/core";

/**
 * Validate a bearer token from request headers against the stored api_token.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function validateApiToken(headers: Headers): boolean {
  const authHeader = headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const provided = authHeader.slice(7);
  if (!provided) return false;
  const db = getDb();
  const stored = getSetting(db, "api_token");
  if (!stored) return false;

  // Timing-safe comparison — both must be the same length
  if (provided.length !== stored.length) return false;
  return timingSafeEqual(
    Buffer.from(provided),
    Buffer.from(stored),
  );
}

/**
 * Guard for API v1 route handlers. Returns a 401 response if auth fails,
 * or null if auth succeeds. Usage:
 *
 *   const denied = requireAuth(request);
 *   if (denied) return denied;
 */
export function requireAuth(request: NextRequest): NextResponse | null {
  try {
    if (!validateApiToken(request.headers)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }
    return null;
  } catch (err) {
    console.error("[issuectl] Auth check failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
