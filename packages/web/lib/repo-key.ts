/**
 * Canonical `owner/name` key shared across UI + cache lookups. Lives in the
 * web package (not core) because every consumer is either a client component
 * or a web-local util — pulling core as a runtime dep from a client file
 * drags better-sqlite3 into the client bundle.
 */
export function repoKey(r: { owner: string; name: string }): string {
  return `${r.owner}/${r.name}`;
}

/**
 * Inverse of `repoKey` — parse `"owner/name"` back into its parts.
 * Returns `null` for malformed input (missing slash, empty owner or name).
 */
export function parseRepoKey(
  key: string,
): { owner: string; name: string } | null {
  const idx = key.indexOf("/");
  if (idx < 1 || idx >= key.length - 1) return null;
  return { owner: key.slice(0, idx), name: key.slice(idx + 1) };
}
