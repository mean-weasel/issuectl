import { spawn } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ParsedIssuesResponse } from "./types.js";
import { PARSED_ISSUES_SCHEMA } from "./schema.js";
import { ISSUE_PARSER_PROMPT } from "./prompt-text.js";

type ParseResult =
  | { success: true; data: ParsedIssuesResponse; sessionId: string; cost: number }
  | { success: false; error: string };

type ClaudeResultEvent = {
  type: "result";
  session_id: string;
  result: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structured_output?: any;
  total_cost_usd: number;
  duration_ms: number;
  num_turns: number;
};

export async function checkClaudeCliAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("claude", ["--version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

export async function parseIssues(
  userInput: string,
  contextPrompt: string,
  options?: { timeoutMs?: number },
): Promise<ParseResult> {
  const timeoutMs = options?.timeoutMs ?? 90_000;

  const promptFilePath = join(
    tmpdir(),
    `issuectl-parse-prompt-${Date.now()}.txt`,
  );

  try {
    await writeFile(promptFilePath, ISSUE_PARSER_PROMPT, "utf-8");
  } catch (err) {
    return {
      success: false,
      error: `Failed to write prompt file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const fullPrompt = `${contextPrompt}\n\n---\n\n## User Input\n\n${userInput}`;

  const args = [
    "-p",
    fullPrompt,
    "--append-system-prompt-file",
    promptFilePath,
    "--output-format",
    "stream-json",
    "--verbose",
    "--json-schema",
    JSON.stringify(PARSED_ISSUES_SCHEMA),
    "--max-turns",
    "6",
    "--allowedTools",
    "Bash",
    "--print",
  ];

  return new Promise((resolve) => {
    const claude = spawn("claude", args, {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";
    let finalResult: ClaudeResultEvent | null = null;
    let settled = false;

    const finish = (result: ParseResult) => {
      if (settled) return;
      settled = true;
      unlink(promptFilePath).catch(() => {});
      resolve(result);
    };

    const timer = setTimeout(() => {
      claude.kill("SIGTERM");
      finish({ success: false, error: "Claude CLI timed out" });
    }, timeoutMs);

    claude.stdout.on("data", (data: Buffer) => {
      stdoutBuffer += data.toString();

      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as { type: string };
          if (event.type === "result") {
            finalResult = event as ClaudeResultEvent;
          }
        } catch {
          // Not valid JSON line, skip
        }
      }
    });

    claude.stderr.on("data", (data: Buffer) => {
      stderrBuffer += data.toString();
    });

    claude.on("error", (err) => {
      clearTimeout(timer);
      finish({
        success: false,
        error:
          err.message === "spawn claude ENOENT"
            ? "Claude CLI is not installed. Install from https://docs.anthropic.com/en/docs/claude-code"
            : `Claude CLI error: ${err.message}`,
      });
    });

    claude.on("close", (code) => {
      clearTimeout(timer);

      if (code !== 0 && finalResult) {
        console.warn(
          `[issuectl] Claude CLI exited with code ${code} but produced a result. stderr: ${stderrBuffer.trim()}`,
        );
      }

      if (code !== 0 && !finalResult) {
        finish({
          success: false,
          error: `Claude CLI exited with code ${code}: ${stderrBuffer.trim() || "(no output)"}`,
        });
        return;
      }

      if (!finalResult) {
        finish({
          success: false,
          error: "Claude CLI produced no result event",
        });
        return;
      }

      const parsed = finalResult.structured_output as
        | ParsedIssuesResponse
        | undefined;
      if (!parsed || !Array.isArray(parsed.issues)) {
        finish({
          success: false,
          error: "Claude CLI returned invalid structured output",
        });
        return;
      }

      finish({
        success: true,
        data: parsed,
        sessionId: finalResult.session_id,
        cost: finalResult.total_cost_usd,
      });
    });
  });
}
