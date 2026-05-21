import { beforeEach, describe, expect, it } from "vitest";
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
