import { parse } from "shell-quote";

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

// Update by running `claude --help` and adding any new flags.
// Unknown flags produce a warning (not an error), so mild lag is tolerable.
export const KNOWN_CLAUDE_FLAGS: readonly string[] = [
  "--dangerously-skip-permissions",
  "--model",
  "--max-turns",
  "--print", "-p",
  "--verbose",
  "--debug",
  "--output-format",
  "--input-format",
  "--session-id",
  "--continue", "-c",
  "--resume", "-r",
  "--add-dir",
  "--allowed-tools",
  "--disallowed-tools",
  "--mcp-config",
  "--permission-mode",
  "--append-system-prompt",
  "--help", "-h",
  "--version",
];

const OPERATOR_ERROR =
  "Shell operators (; && || | > < `...` $(...)) are not allowed. Args are passed directly to claude.";

function hasUnmatchedQuote(s: string): boolean {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (const ch of s) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && !inSingle) {
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    }
  }
  return inSingle || inDouble;
}

export function validateClaudeArgs(input: string): ValidationResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: true, errors: [], warnings: [] };
  }

  if (hasUnmatchedQuote(trimmed)) {
    return {
      ok: false,
      errors: ["Unclosed quote or invalid shell syntax."],
      warnings: [],
    };
  }

  // shell-quote does not flag backtick substitution as an operator — check explicitly.
  if (/`/.test(trimmed)) {
    return { ok: false, errors: [OPERATOR_ERROR], warnings: [] };
  }

  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(trimmed);
  } catch (err) {
    return {
      ok: false,
      errors: [
        `Invalid shell syntax: ${err instanceof Error ? err.message : String(err)}`,
      ],
      warnings: [],
    };
  }

  const warnings: string[] = [];
  const knownSet = new Set<string>(KNOWN_CLAUDE_FLAGS);

  for (const entry of parsed) {
    if (typeof entry !== "string") {
      return { ok: false, errors: [OPERATOR_ERROR], warnings: [] };
    }
    const eqIdx = entry.indexOf("=");
    const flagName = eqIdx >= 0 ? entry.slice(0, eqIdx) : entry;
    if (flagName.startsWith("-") && !knownSet.has(flagName)) {
      warnings.push(`${flagName} is not a recognized Claude flag.`);
    }
  }

  return { ok: true, errors: [], warnings };
}
