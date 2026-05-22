import { beforeEach, describe, expect, it } from "vitest";
import { ensureNodePtySpawnHelperExecutable } from "./node-pty-spawn-helper.js";
import { isPtyBridgeEnabled, parsePtyClientMessage } from "./pty-terminal-websocket.js";

describe("isPtyBridgeEnabled", () => {
  beforeEach(() => {
    delete process.env.ISSUECTL_PTY_BRIDGE;
  });

  it("requires the explicit experiment flag", () => {
    expect(isPtyBridgeEnabled()).toBe(false);
    process.env.ISSUECTL_PTY_BRIDGE = "1";
    expect(isPtyBridgeEnabled()).toBe(true);
  });
});

describe("parsePtyClientMessage", () => {
  it("parses input messages", () => {
    expect(parsePtyClientMessage(Buffer.from(JSON.stringify({ type: "input", data: "ls\n" })))).toEqual({
      type: "input",
      data: "ls\n",
    });
  });

  it("clamps resize dimensions", () => {
    expect(parsePtyClientMessage(Buffer.from(JSON.stringify({ type: "resize", cols: 999, rows: 1 })))).toEqual({
      type: "resize",
      cols: 240,
      rows: 5,
    });
  });

  it("rejects malformed or oversized input", () => {
    expect(parsePtyClientMessage(Buffer.from("{"))).toBeNull();
    expect(parsePtyClientMessage(Buffer.from(JSON.stringify({ type: "input", data: "x".repeat(70_000) })))).toBeNull();
  });
});

describe("ensureNodePtySpawnHelperExecutable", () => {
  it("chmods a non-executable macOS spawn helper once", () => {
    const calls: string[] = [];
    const access = () => {
      calls.push("access");
      if (calls.length === 1) throw new Error("not executable");
    };
    const chmod = (_path: unknown, mode: string | number) => {
      calls.push(`chmod:${Number(mode).toString(8)}`);
    };

    expect(ensureNodePtySpawnHelperExecutable({
      helperPath: "/tmp/node-pty/prebuilds/darwin-arm64/spawn-helper",
      access,
      chmod,
      resetCache: true,
    })).toBe(true);
    expect(ensureNodePtySpawnHelperExecutable({
      helperPath: "/tmp/node-pty/prebuilds/darwin-arm64/spawn-helper",
      access,
      chmod,
    })).toBe(false);
    expect(calls).toEqual(["access", "chmod:755", "access"]);
  });

  it("skips non-macOS platforms", () => {
    expect(ensureNodePtySpawnHelperExecutable({
      platform: "linux",
      arch: "arm64",
      resolveNodePty: () => "/tmp/node-pty/lib/index.js",
      access: () => {
        throw new Error("should not access");
      },
      chmod: () => {
        throw new Error("should not chmod");
      },
      resetCache: true,
    })).toBe(false);
  });
});
