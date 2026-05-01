import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile, execFileSync } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  isTmuxSessionAlive,
  isTtydAlive,
  killTtyd,
  spawnTtyd,
} from "./ttyd.js";

const execFileAsync = promisify(execFile);

type Prereq =
  | { ok: true; codexPath: string }
  | { ok: false; reason: string };

async function prereqs(): Promise<Prereq> {
  for (const bin of ["codex", "ttyd", "tmux"] as const) {
    try {
      execFileSync("which", [bin], { stdio: "ignore" });
    } catch {
      return { ok: false, reason: `${bin} is not installed` };
    }
  }

  const codexPath = execFileSync("which", ["codex"], {
    encoding: "utf8",
  }).trim();
  return { ok: true, codexPath };
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate a TCP port")));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function readFileEventually(
  path: string,
  timeoutMs = 5_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const content = await readFile(path, "utf8");
      if (content.trim()) return content;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Timed out waiting for ${path}`);
}

describe("codex ttyd integration", () => {
  let ttydPid: number | undefined;
  let sessionName: string | undefined;
  let tempDir: string | undefined;

  afterEach(async () => {
    if (ttydPid !== undefined) {
      try {
        killTtyd(ttydPid, sessionName);
      } catch {
        // Best effort cleanup; assertions already failed if this matters.
      }
    } else if (sessionName) {
      try {
        await execFileAsync("tmux", ["kill-session", "-t", sessionName]);
      } catch {
        // Session may already be gone.
      }
    }

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }

    ttydPid = undefined;
    sessionName = undefined;
    tempDir = undefined;
  });

  it("spawns a real ttyd/tmux session backed by the actual codex binary", async () => {
    const check = await prereqs();
    if (!check.ok) {
      console.warn(`[issuectl] skipping codex ttyd integration: ${check.reason}`);
      return;
    }

    tempDir = await mkdtemp(join(tmpdir(), "issuectl-codex-ttyd-"));
    const contextFilePath = join(tempDir, "context.md");
    await writeFile(
      contextFilePath,
      "Issue #123\n\nThis context is only used by the Codex ttyd integration test.\n",
      "utf8",
    );

    const port = await getFreePort();
    sessionName = `issuectl_codex_it_${process.pid}_${Date.now()}`;
    const versionOutputPath = join(tempDir, "codex-version.txt");
    const agentCommand = `${check.codexPath} --version > '${versionOutputPath}'; sleep 30`;

    const result = await spawnTtyd({
      port,
      workspacePath: tempDir,
      contextFilePath,
      agentCommand,
      sessionName,
    });
    ttydPid = result.pid;

    expect(result.port).toBe(port);
    expect(isTtydAlive(ttydPid)).toBe(true);
    expect(isTmuxSessionAlive(sessionName)).toBe(true);

    const startCommand = execFileSync(
      "tmux",
      ["list-panes", "-t", sessionName, "-F", "#{pane_start_command}"],
      { encoding: "utf8" },
    );
    expect(startCommand).toContain(check.codexPath);
    expect(startCommand).toContain("--version");

    const versionOutput = await readFileEventually(versionOutputPath);
    expect(versionOutput).toMatch(/codex/i);
  });
});
