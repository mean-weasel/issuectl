/**
 * Canonical `owner/name` key shared across UI + cache lookups. Lives in the
 * web package (not core) because every consumer is either a client component
 * or a web-local util — pulling core as a runtime dep from a client file
 * drags better-sqlite3 into the client bundle.
 */
export function repoKey(r: { owner: string; name: string }): string {
  return `${r.owner}/${r.name}`;
}
