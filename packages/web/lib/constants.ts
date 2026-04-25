export const DEFAULT_BRANCH_PATTERN = "issue-{number}-{slug}";

/** Must match server-side validation in launch.ts — shared to prevent drift. */
export const VALID_BRANCH_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;

/** Max preamble length enforced client- and server-side. */
export const MAX_PREAMBLE = 10000;

/** Max comment body length enforced client- and server-side. */
export const MAX_COMMENT_BODY = 65536;

export const REPO_COLORS = [
  "#f85149",
  "#58a6ff",
  "#3fb950",
  "#bc8cff",
  "#d29922",
  "#39d0d6",
  "#e87125",
];
