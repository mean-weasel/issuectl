import type { Section, SortMode } from "@issuectl/core";

export type HrefParams = {
  tab?: "issues" | "prs";
  repo?: string | null;
  mine?: boolean | null;
  section?: Section | null;
  sort?: SortMode | null;
};

/**
 * Builds the dashboard URL from filter/tab/section state. Conventions:
 *   - `tab === "issues"` is default → omitted from the URL.
 *   - `mine === true` → `mine=1`; null/false → omitted (default is "everyone").
 *   - `section === "in_focus"` is default → omitted.
 *   - `repo` is passed through verbatim when non-empty.
 *
 * Keeping defaults out of the URL keeps `/` canonical and makes back-button
 * deduplication sane — every "home" link is literally `/`, not `/?tab=issues`.
 */
export function buildHref(params: HrefParams): string {
  const search = new URLSearchParams();
  if (params.tab === "prs") search.set("tab", "prs");
  if (params.repo) search.set("repo", params.repo);
  if (params.mine === true) search.set("mine", "1");
  if (params.section && params.section !== "in_focus") {
    search.set("section", params.section);
  }
  if (params.sort && params.sort !== "updated") {
    search.set("sort", params.sort);
  }
  const qs = search.toString();
  return qs ? `/?${qs}` : "/";
}
