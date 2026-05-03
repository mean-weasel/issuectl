import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb, getSetting } from "@issuectl/core";
import log from "./logger";

let cachedApiToken: string | undefined;
let hasLoadedApiToken = false;

function getApiToken(): string | undefined {
  if (hasLoadedApiToken) return cachedApiToken;

  const db = getDb();
  cachedApiToken = getSetting(db, "api_token");
  hasLoadedApiToken = true;
  return cachedApiToken;
}

export function resetApiTokenCache(): void {
  cachedApiToken = undefined;
  hasLoadedApiToken = false;
}

/**
 * Validate a bearer token from request headers against the stored api_token.
 * Uses timing-safe comparison to prevent timing attacks. Note: a length
 * mismatch causes an early return, which reveals that the token length
 * differs — acceptable because the token is a random secret, not a password.
 */
export function validateApiToken(headers: Headers): boolean {
  const authHeader = headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const provided = authHeader.slice(7);
  if (!provided) return false;
  const stored = getApiToken();
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
      log.warn({ msg: "api_auth_failed", url: request.nextUrl.pathname });
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }
    return null;
  } catch (err) {
    log.error({ err, msg: "api_auth_error" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
