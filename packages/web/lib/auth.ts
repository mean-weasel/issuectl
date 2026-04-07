import { checkGhAuth } from "@issuectl/core";

export type AuthStatus =
  | { authenticated: true; username: string }
  | { authenticated: false; error: string };

/** Never throws — unexpected errors are returned as { authenticated: false }. */
export async function getAuthStatus(): Promise<AuthStatus> {
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
