import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { createGhosttyLauncher, resolveGhosttyBinary } from "./ghostty.js";
import type { TerminalSettings } from "../terminal.js";

const execFileAsync = promisify(execFile);

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isGhosttyRunning(): Promise<boolean> {
  try {
    await execFileAsync("pgrep", ["-ix", "ghostty"]);
    return true;
  } catch {
    return false;
  }
}

async function getGhosttyPids(): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync("pgrep", ["-ix", "ghostty"]);
    return stdout.trim().split("\n").map(Number).filter(Boolean);
  } catch {
    return [];
  }
}

async function canRunIntegrationTests(): Promise<{ ok: boolean; reason?: string }> {
  if (process.platform !== "darwin") {
    return { ok: false, reason: "Not macOS — skipping Ghostty integration tests" };
  }

  try {
    await resolveGhosttyBinary();
  } catch {
    return { ok: false, reason: "Ghostty not installed — skipping integration tests" };
  }

  if (!(await isGhosttyRunning())) {
    return { ok: false, reason: "Ghostty not running — start Ghostty before running integration tests" };
  }

  return { ok: true };
}

let skipReason: string | undefined;
let pidsBefore: number[];

beforeAll(async () => {
  const check = await canRunIntegrationTests();
  if (!check.ok) {
    skipReason = check.reason;
    return;
  }
  pidsBefore = await getGhosttyPids();
});

afterEach(async () => {
  if (skipReason) return;
  // Kill any new Ghostty processes spawned by tests
  const pidsNow = await getGhosttyPids();
  const newPids = pidsNow.filter((p) => !pidsBefore.includes(p));
  for (const pid of newPids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Process may have already exited
    }
  }
  await delay(500);
});

afterAll(async () => {
  if (skipReason) return;
  const pidsNow = await getGhosttyPids();
  const newPids = pidsNow.filter((p) => !pidsBefore.includes(p));
  for (const pid of newPids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Process may have already exited
    }
  }
});

describe("Ghostty integration", () => {
  function makeLauncher(windowTitle: string) {
    const settings: TerminalSettings = {
      terminal: "ghostty",
      windowTitle,
      tabTitlePattern: "#{number} — {title}",
    };
    return createGhosttyLauncher(settings);
  }

  const launchOptions = {
    workspacePath: "/tmp",
    contextFilePath: "/dev/null",
    issueNumber: 99,
    issueTitle: "Test tab title",
    owner: "test-org",
    repo: "test-repo",
  };

  it("launches a new Ghostty window without error", async ({ skip }) => {
    if (skipReason) skip(skipReason);

    const launcher = makeLauncher(`issuectl-test-${randomUUID().slice(0, 8)}`);
    await expect(launcher.launch(launchOptions)).resolves.toBeUndefined();
    await delay(1000);

    // Verify a new Ghostty process was spawned
    const pidsNow = await getGhosttyPids();
    const newPids = pidsNow.filter((p) => !pidsBefore.includes(p));
    expect(newPids.length).toBeGreaterThanOrEqual(1);
  });

  it("launches with em dash in tab title without error", async ({ skip }) => {
    if (skipReason) skip(skipReason);

    const launcher = makeLauncher(`issuectl-test-${randomUUID().slice(0, 8)}`);
    // em dash in the title pattern — this was a problem with AppleScript
    await expect(launcher.launch({
      ...launchOptions,
      issueTitle: "Fix — dash handling",
    })).resolves.toBeUndefined();
  });

  it("launches with special characters in paths", async ({ skip }) => {
    if (skipReason) skip(skipReason);

    const launcher = makeLauncher(`issuectl-test-${randomUUID().slice(0, 8)}`);
    await expect(launcher.launch({
      ...launchOptions,
      workspacePath: "/tmp/my project",
    })).resolves.toBeUndefined();
  });

  it("verify resolves the Ghostty binary", async ({ skip }) => {
    if (skipReason) skip(skipReason);

    const binary = await resolveGhosttyBinary();
    expect(binary).toBeTruthy();

    // Verify it can actually get the version
    const { stdout } = await execFileAsync(binary, ["--version"]);
    expect(stdout).toContain("1.");
  });
});
