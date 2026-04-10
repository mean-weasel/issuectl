// Client-safe entry point: pure validation with no Node built-ins. Imported from
// the browser bundle — do not add anything here that touches the DB, Octokit, fs,
// or child_process, or the Next.js client build will break.
export {
  validateClaudeArgs,
  KNOWN_CLAUDE_FLAGS,
  type ValidationResult,
} from "./launch/claude-args.js";
