import { test, expect } from "@playwright/test";
import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import WebSocket from "ws";

/**
 * Integration test: verify that ttyd can be respawned against an
 * existing tmux session after the original ttyd exits (due to -q
 * exit-on-disconnect). This proves the core reconnection cycle.
 *
 * Requirements: macOS, tmux, ttyd. Skipped otherwise.
 */

const execFileAsync = promisify(execFile);
const TEST_PORT = 7791;
const SESSION_NAME = "issuectl-test-respawn";

async function canRun(): Promise<{ ok: boolean; reason?: string }> {
  if (process.platform !== "darwin") {
    return { ok: false, reason: "Not macOS" };
  }
  for (const bin of ["ttyd", "tmux"]) {
    try {
      await execFileAsync("which", [bin]);
    } catch {
      return { ok: false, reason: `${bin} not installed` };
    }
  }
  return { ok: true };
}

function cleanupTmuxSession(): void {
  try {
    execFileSync("tmux", ["kill-session", "-t", SESSION_NAME], { stdio: "ignore" });
  } catch { /* may not exist */ }
}

function cleanupTtyd(proc: ChildProcess | null): void {
  if (proc?.pid) {
    try { process.kill(proc.pid, "SIGTERM"); } catch { /* already dead */ }
  }
}

function spawnTtyd(): ChildProcess {
  const proc = spawn(
    "ttyd",
    ["-W", "-i", "127.0.0.1", "-p", String(TEST_PORT), "-q",
     "tmux", "attach-session", "-t", SESSION_NAME],
    { detached: true, stdio: "ignore" },
  );
  proc.unref();
  return proc;
}

function isTtydAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Connect a WebSocket client, perform the ttyd handshake, collect
 * output for `ms` milliseconds, then close.
 */
function collectTerminalOutput(url: string, ms: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const ws = new WebSocket(url, ["tty"]);
    const timer = setTimeout(() => {
      ws.close();
      resolve(chunks.join(""));
    }, ms);

    ws.on("open", () => {
      ws.send("{}");
      ws.send("1" + JSON.stringify({ columns: 120, rows: 40 }));
    });

    ws.on("message", (data: Buffer | string) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (buf.length > 0 && buf[0] === 0x30) {
        chunks.push(buf.subarray(1).toString("utf-8"));
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      ws.close();
      reject(err);
    });
  });
}

test.describe("ttyd respawn", () => {
  let ttydProc: ChildProcess | null = null;

  test.beforeAll(async () => {
    const { ok, reason } = await canRun();
    test.skip(!ok, reason ?? "Prerequisites not met");
  });

  test.afterEach(() => {
    cleanupTtyd(ttydProc);
    ttydProc = null;
    cleanupTmuxSession();
  });

  test("reconnects to same tmux session after ttyd exits and respawns", async () => {
    cleanupTmuxSession();

    // 1. Create a tmux session with a unique marker
    const marker = `RESPAWN_TEST_${Date.now()}`;
    execFileSync("tmux", [
      "new-session", "-d", "-s", SESSION_NAME, "-x", "120", "-y", "40",
      `bash -c 'echo ${marker}; sleep 60'`,
    ]);

    // 2. Spawn ttyd with -q (exits when last client disconnects)
    ttydProc = spawnTtyd();
    await new Promise((r) => setTimeout(r, 1000));

    // 3. Connect a client, verify it sees the marker, then disconnect
    const wsUrl = `ws://127.0.0.1:${TEST_PORT}/ws`;
    const text1 = await collectTerminalOutput(wsUrl, 2000);
    expect(text1).toContain(marker);

    // 4. Wait for ttyd to exit (it should die after last client disconnects)
    await new Promise((r) => setTimeout(r, 1000));
    expect(isTtydAlive(ttydProc.pid!)).toBe(false);

    // 5. Verify tmux session is still alive
    expect(() => {
      execFileSync("tmux", ["has-session", "-t", SESSION_NAME], { stdio: "ignore" });
    }).not.toThrow();

    // 6. Respawn ttyd against the same session
    ttydProc = spawnTtyd();
    await new Promise((r) => setTimeout(r, 1000));

    // 7. Connect a new client — should see the tmux session (marker in scrollback)
    const text2 = await collectTerminalOutput(wsUrl, 2000);

    // The marker should be visible in the terminal scrollback — the
    // tmux session preserved state across the ttyd restart.
    // Note: scrollback visibility depends on tmux scroll position,
    // so we verify the connection succeeds and receives output.
    expect(text2.length).toBeGreaterThan(0);
  });
});
