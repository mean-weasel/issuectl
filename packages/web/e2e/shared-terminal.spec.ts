import { test, expect } from "@playwright/test";
import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import WebSocket from "ws";

/**
 * Integration test: verify that two WebSocket clients connected to the
 * same ttyd instance see the same terminal output via a shared tmux
 * session. This validates the core shared-viewing feature.
 *
 * Requirements: macOS, tmux, ttyd. Skipped on non-macOS or when
 * binaries are unavailable.
 */

const execFileAsync = promisify(execFile);
const TEST_PORT = 7790; // high in range, unlikely to collide
const SESSION_NAME = "issuectl-test-shared";

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
  } catch {
    // session may not exist
  }
}

function cleanupTtyd(proc: ChildProcess | null): void {
  if (proc?.pid) {
    try { process.kill(proc.pid, "SIGTERM"); } catch { /* already dead */ }
  }
}

/**
 * Collect terminal output from a ttyd WebSocket connection.
 *
 * ttyd uses a binary protocol: each message starts with a type byte.
 * Type 0x30 ('0') = terminal output. The actual text follows that byte.
 * We also send the initial handshake (auth token + resize) that ttyd
 * expects before it starts forwarding terminal data.
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
      // ttyd expects a JSON auth token first (type '{'). For unauthenticated
      // instances, sending an empty token works. Then send terminal resize.
      ws.send('{}');
      // Type 0x31 ('1') = resize: JSON {columns, rows}
      ws.send('1' + JSON.stringify({ columns: 120, rows: 40 }));
    });

    ws.on("message", (data: Buffer | string) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (buf.length === 0) return;
      // Type 0x30 ('0') = terminal output
      if (buf[0] === 0x30) {
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

test.describe("shared terminal session", () => {
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

  test("two clients see the same terminal output via tmux", async () => {
    cleanupTmuxSession();

    // 1. Create a tmux session that echoes a unique marker
    const marker = `SHARED_TEST_${Date.now()}`;
    execFileSync("tmux", [
      "new-session", "-d", "-s", SESSION_NAME, "-x", "120", "-y", "40",
      `bash -c 'echo ${marker}; sleep 30'`,
    ]);
    execFileSync("tmux", ["set-option", "-t", SESSION_NAME, "status", "off"]);

    // 2. Spawn ttyd pointing at tmux attach
    ttydProc = spawn(
      "ttyd",
      ["-W", "-i", "127.0.0.1", "-p", String(TEST_PORT), "-q",
       "tmux", "attach-session", "-t", SESSION_NAME],
      { detached: true, stdio: "ignore" },
    );
    ttydProc.unref();

    // Wait for ttyd to start listening
    await new Promise((r) => setTimeout(r, 1000));

    // 3. Connect two WebSocket clients simultaneously
    const wsUrl = `ws://127.0.0.1:${TEST_PORT}/ws`;
    const [text1, text2] = await Promise.all([
      collectTerminalOutput(wsUrl, 3000),
      collectTerminalOutput(wsUrl, 3000),
    ]);

    // 4. Both clients should have received the marker — proving they
    //    share the same tmux session, not independent shells
    expect(text1).toContain(marker);
    expect(text2).toContain(marker);
  });

  test("second client joins mid-session and sees later output", async () => {
    cleanupTmuxSession();

    // 1. Create tmux session that outputs numbered lines every second
    execFileSync("tmux", [
      "new-session", "-d", "-s", SESSION_NAME, "-x", "120", "-y", "40",
      "bash -c 'for i in $(seq 1 10); do echo LINE_$i; sleep 1; done; sleep 30'",
    ]);
    execFileSync("tmux", ["set-option", "-t", SESSION_NAME, "status", "off"]);

    // 2. Spawn ttyd
    ttydProc = spawn(
      "ttyd",
      ["-W", "-i", "127.0.0.1", "-p", String(TEST_PORT), "-q",
       "tmux", "attach-session", "-t", SESSION_NAME],
      { detached: true, stdio: "ignore" },
    );
    ttydProc.unref();
    await new Promise((r) => setTimeout(r, 1000));

    const wsUrl = `ws://127.0.0.1:${TEST_PORT}/ws`;

    // 3. First client connects immediately
    const client1Promise = collectTerminalOutput(wsUrl, 6000);

    // 4. Second client connects after 3 seconds (mid-stream)
    await new Promise((r) => setTimeout(r, 3000));
    const client2Promise = collectTerminalOutput(wsUrl, 6000);

    const [text1, text2] = await Promise.all([client1Promise, client2Promise]);

    // Client 1 should have early lines
    expect(text1).toContain("LINE_1");

    // Both clients should share later lines �� the key proof that
    // client 2 joined the SAME session, not a fresh one
    const laterLines = ["LINE_5", "LINE_6", "LINE_7"];
    const client1HasLater = laterLines.some((l) => text1.includes(l));
    const client2HasLater = laterLines.some((l) => text2.includes(l));
    expect(client1HasLater).toBe(true);
    expect(client2HasLater).toBe(true);
  });

  test("tmux session is cleaned up after kill", async () => {
    cleanupTmuxSession();

    // Create a session
    execFileSync("tmux", [
      "new-session", "-d", "-s", SESSION_NAME,
      "bash -c 'sleep 60'",
    ]);

    // Verify it exists
    const before = execFileSync("tmux", ["list-sessions", "-F", "#{session_name}"])
      .toString().trim().split("\n");
    expect(before).toContain(SESSION_NAME);

    // Kill it like killTtyd would
    execFileSync("tmux", ["kill-session", "-t", SESSION_NAME], { stdio: "ignore" });

    // Verify it's gone
    let after: string[] = [];
    try {
      after = execFileSync("tmux", ["list-sessions", "-F", "#{session_name}"])
        .toString().trim().split("\n");
    } catch {
      // list-sessions fails when no sessions exist — that's fine
    }
    expect(after).not.toContain(SESSION_NAME);
  });
});
