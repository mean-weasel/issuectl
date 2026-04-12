import { Octokit } from "@octokit/rest";
import { getGhToken } from "./auth.js";

let instance: Octokit | null = null;

export async function getOctokit(): Promise<Octokit> {
  if (instance) return instance;
  const token = await getGhToken();
  instance = new Octokit({ auth: token });
  return instance;
}

export function resetOctokit(): void {
  instance = null;
}

/**
 * Run a GitHub API call with automatic recovery from a stale cached token.
 * If the underlying call throws a 401, discard the cached Octokit, re-read
 * the token via `gh auth token`, and retry once. Any second failure (401 or
 * otherwise) propagates to the caller.
 *
 * The Octokit singleton lives for the lifetime of the Next.js process — it
 * is never re-instantiated on its own. If the user runs `gh auth refresh`
 * or the token rotates, the cached instance silently breaks until the
 * process restarts. This helper fixes that without forcing every action to
 * manage the reset lifecycle.
 */
export async function withAuthRetry<T>(
  fn: (octokit: Octokit) => Promise<T>,
): Promise<T> {
  const octokit = await getOctokit();
  try {
    return await fn(octokit);
  } catch (err) {
    if (isAuthError(err)) {
      resetOctokit();
      const fresh = await getOctokit();
      return await fn(fresh);
    }
    throw err;
  }
}

function isAuthError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status?: number }).status === 401
  );
}
