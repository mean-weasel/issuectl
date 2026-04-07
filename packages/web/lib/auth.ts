import { checkGhAuth } from "@issuectl/core";

export type AuthStatus =
  | { authenticated: true; username: string }
  | { authenticated: false; error: string };

export async function getAuthStatus(): Promise<AuthStatus> {
  const result = await checkGhAuth();
  if (result.ok && result.username) {
    return { authenticated: true, username: result.username };
  }
  return {
    authenticated: false,
    error: result.error ?? "GitHub CLI authentication failed",
  };
}
