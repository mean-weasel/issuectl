import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function getGhToken(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"]);
    const token = stdout.trim();
    if (!token) {
      throw new Error("gh auth token returned empty output");
    }
    return token;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error";
    throw new Error(
      `Failed to get GitHub token via 'gh auth token': ${message}. ` +
        "Ensure the GitHub CLI is installed and you are authenticated (run 'gh auth login').",
      { cause: err },
    );
  }
}

export async function checkGhAuth(): Promise<{
  ok: boolean;
  username?: string;
  error?: string;
}> {
  try {
    const { stdout, stderr } = await execFileAsync("gh", [
      "auth",
      "status",
    ]);
    const output = stdout + stderr;
    // Matches both "Logged in to github.com as user" (old gh) and
    // "Logged in to github.com account user (keyring)" (new gh)
    const match = output.match(/Logged in to \S+ (?:as|account) (\S+)/);
    return {
      ok: true,
      username: match?.[1],
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "gh auth status failed",
    };
  }
}
