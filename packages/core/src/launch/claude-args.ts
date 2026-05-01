import { parse } from "shell-quote";

export type ValidationResult = {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
};

// Unknown flags only produce warnings, so this list can lag the claude CLI without breaking users.
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

export const KNOWN_CODEX_FLAGS: readonly string[] = [
  "--sandbox",
  "--ask-for-approval",
  "--model",
  "--profile",
  "--cd",
  "--add-dir",
  "--search",
  "--full-auto",
  "--dangerously-bypass-approvals-and-sandbox",
  "--config", "-c",
  "--enable",
  "--disable",
  "--remote",
  "--remote-auth-token-env",
  "--image", "-i",
  "--oss",
  "--local-provider",
  "--no-alt-screen",
  "--help", "-h",
  "--version", "-V",
];

const OPERATOR_ERROR =
  "Shell operators (; && || | > < `...` $(...)) are not allowed. Args are passed directly to the agent.";

// shell-quote silently closes unmatched quotes at end-of-string instead of throwing
// (verified empirically — `parse('--foo "bar')` returns `["--foo", "bar"]`). This
// pre-check is the only thing that prevents an unmatched quote from slipping past
// validation and into the shell, so do not remove it.
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

function validateAgentArgs(
  input: string,
  knownFlags: readonly string[],
  agentLabel: "Claude" | "Codex",
): ValidationResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: true, errors: [], warnings: [] };
  }

  // shell-quote treats \n, \r, \t as whitespace, but bash treats newlines as
  // statement terminators. Without this check, "--foo\nrm -rf /" would validate ok
  // and the raw string would split into two shell commands at launch time.
  // eslint-disable-next-line no-control-regex
  if (/[\n\r\t\x00-\x08\x0b-\x1f\x7f]/.test(trimmed)) {
    return {
      ok: false,
      errors: ["Control characters (including newlines and tabs) are not allowed in extra args."],
      warnings: [],
    };
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

  // shell-quote silently collapses $VAR and ${VAR} to empty strings, but bash -lic
  // at launch time actually expands them. Reject to preserve the "passed verbatim" contract.
  if (/\$/.test(trimmed)) {
    return {
      ok: false,
      errors: [`Variable expansion ($VAR, \${VAR}) is not allowed. Args are passed directly to ${agentLabel}.`],
      warnings: [],
    };
  }

  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(trimmed);
  } catch (err) {
    console.error(`[issuectl] validate${agentLabel}Args: shell-quote.parse threw`, { input: trimmed, err });
    return {
      ok: false,
      errors: [
        `Invalid shell syntax: ${err instanceof Error ? err.message : String(err)}`,
      ],
      warnings: [],
    };
  }

  const warnings: string[] = [];
  const knownSet = new Set<string>(knownFlags);

  for (const entry of parsed) {
    if (typeof entry === "string") {
      const eqIdx = entry.indexOf("=");
      const flagName = eqIdx >= 0 ? entry.slice(0, eqIdx) : entry;
      if (flagName.startsWith("-") && !knownSet.has(flagName)) {
        warnings.push(`${flagName} is not a recognized ${agentLabel} flag.`);
      }
      continue;
    }

    // Non-string entry — differentiate comments, globs, operators
    if ("comment" in entry) {
      return {
        ok: false,
        errors: ["Shell comments (#) are not allowed."],
        warnings: [],
      };
    }
    if ("op" in entry && entry.op === "glob") {
      return {
        ok: false,
        errors: [`Glob patterns are not allowed — quote the value if you want a literal asterisk. (Got: ${(entry as { pattern?: string }).pattern ?? "glob"})`],
        warnings: [],
      };
    }
    return { ok: false, errors: [OPERATOR_ERROR], warnings: [] };
  }

  return { ok: true, errors: [], warnings };
}

export function validateClaudeArgs(input: string): ValidationResult {
  return validateAgentArgs(input, KNOWN_CLAUDE_FLAGS, "Claude");
}

export function validateCodexArgs(input: string): ValidationResult {
  return validateAgentArgs(input, KNOWN_CODEX_FLAGS, "Codex");
}
