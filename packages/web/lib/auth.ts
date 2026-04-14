import { checkGhAuth } from "@issuectl/core";

export type AuthStatus =
  | { authenticated: true; username: string }
  | { authenticated: false; error: string };

// Success results cache for a minute; failure results cache for 5 s so a
// transient `gh` blip (ENOENT, timeout) recovers quickly instead of
// stranding the user on AuthErrorScreen for a full minute.
const AUTH_TTL_OK_MS = 60_000;
const AUTH_TTL_ERR_MS = 5_000;
let cachedAuth: { status: AuthStatus; expiresAt: number } | null = null;
let inflight: Promise<AuthStatus> | null = null;

async function runCheck(): Promise<AuthStatus> {
  try {
    const result = await checkGhAuth();
    if (result.ok && result.username) {
      return { authenticated: true, username: result.username };
    }
    return {
      authenticated: false,
      error: result.error ?? "GitHub CLI authentication failed",
    };
  } catch (err) {
    console.error("[issuectl] Auth check failed unexpectedly:", err);
    return {
      authenticated: false,
      error: err instanceof Error ? err.message : "Auth check failed",
    };
  }
}

/** Never throws — unexpected errors are returned as { authenticated: false }. */
export async function getAuthStatus(): Promise<AuthStatus> {
  if (cachedAuth && Date.now() < cachedAuth.expiresAt) {
    return cachedAuth.status;
  }
  // Share an in-flight check across concurrent callers so a cold-boot
  // race between instrumentation's warm-up and the first real request
  // only spawns one `gh auth status` subprocess.
  if (inflight) return inflight;
  inflight = runCheck()
    .then((status) => {
      const ttl = status.authenticated ? AUTH_TTL_OK_MS : AUTH_TTL_ERR_MS;
      cachedAuth = { status, expiresAt: Date.now() + ttl };
      return status;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Test-only: reset the module-level cache between cases. No-op in production. */
export function __resetAuthCache(): void {
  if (process.env.NODE_ENV === "production") return;
  cachedAuth = null;
  inflight = null;
}
