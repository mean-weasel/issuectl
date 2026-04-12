import { checkGhAuth } from "@issuectl/core";

export type AuthStatus =
  | { authenticated: true; username: string }
  | { authenticated: false; error: string };

const AUTH_TTL_MS = 60_000;
let cachedAuth: { status: AuthStatus; expiresAt: number } | null = null;

/** Never throws — unexpected errors are returned as { authenticated: false }. */
export async function getAuthStatus(): Promise<AuthStatus> {
  if (cachedAuth && Date.now() < cachedAuth.expiresAt) {
    return cachedAuth.status;
  }

  let status: AuthStatus;
  try {
    const result = await checkGhAuth();
    if (result.ok && result.username) {
      status = { authenticated: true, username: result.username };
    } else {
      status = {
        authenticated: false,
        error: result.error ?? "GitHub CLI authentication failed",
      };
    }
  } catch (err) {
    console.error("[issuectl] Auth check failed unexpectedly:", err);
    status = {
      authenticated: false,
      error: err instanceof Error ? err.message : "Auth check failed",
    };
  }

  cachedAuth = { status, expiresAt: Date.now() + AUTH_TTL_MS };
  return status;
}
