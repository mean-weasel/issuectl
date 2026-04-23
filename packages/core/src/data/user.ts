import type { Octokit } from "@octokit/rest";
import type Database from "better-sqlite3";
import { getCached, setCached } from "../db/cache.js";

const CACHE_KEY = "current-user";

// No isFresh/TTL check: user login doesn't change within a session.
// The entry is still pruned by pruneStaleCache after 24h.
export async function getCurrentUserLogin(
  db: Database.Database,
  octokit: Octokit,
): Promise<string> {
  const cached = getCached<string>(db, CACHE_KEY);
  if (cached) return cached.data;

  const { data } = await octokit.rest.users.getAuthenticated();
  const login = data.login;
  setCached(db, CACHE_KEY, login);
  return login;
}
