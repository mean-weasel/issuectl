export function getErrorHint(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("403")) {
    return "This may be a GitHub rate limit — wait a moment and try again.";
  }
  if (lower.includes("401") || lower.includes("auth") || lower.includes("token")) {
    return "Your GitHub token may have expired — re-run `gh auth login` in your terminal.";
  }
  if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("fetch failed")) {
    return "Could not reach GitHub — check your internet connection.";
  }
  if (lower.includes("timeout") || lower.includes("timedout")) {
    return "The request to GitHub timed out — try again in a moment.";
  }
  return null;
}
