export function getErrorHint(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit")) {
    return "This may be a GitHub rate limit — wait a moment and try again.";
  }
  if (lower.includes("401") || lower.includes("auth") || lower.includes("token")) {
    return "Your GitHub token may have expired — re-run `gh auth login` in your terminal.";
  }
  return null;
}
