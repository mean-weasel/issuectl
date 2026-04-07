import { checkGhAuth } from "@issuectl/core";
import * as log from "./logger.js";

export async function requireAuth(): Promise<{ username: string }> {
  const auth = await checkGhAuth();
  if (!auth.ok) {
    log.error("GitHub CLI is not authenticated.");
    console.error(
      "\nTo fix this:\n" +
        "  1. Install the GitHub CLI: https://cli.github.com/\n" +
        "  2. Run: gh auth login\n" +
        "  3. Then re-run your command.\n",
    );
    if (auth.error) {
      console.error(`Details: ${auth.error}\n`);
    }
    process.exit(1);
  }
  return { username: auth.username ?? "unknown" };
}
