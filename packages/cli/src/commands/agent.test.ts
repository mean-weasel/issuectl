import { Command, CommanderError } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerAgentCommands } from "./agent.js";

const originalIssuectlServerUrl = process.env.ISSUECTL_SERVER_URL;

function createProgram(): { program: Command; stderr: () => string } {
  let stderr = "";
  const program = new Command();
  program
    .name("issuectl")
    .exitOverride()
    .configureOutput({
      writeErr: (value) => {
        stderr += value;
      },
    });
  registerAgentCommands(program);
  return { program, stderr: () => stderr };
}

async function parseCommand(args: string[]): Promise<{
  error?: unknown;
  stderr: string;
  stdout: string;
}> {
  const { program, stderr } = createProgram();
  let stdout = "";
  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((value) => {
    stdout += String(value);
    return true;
  });

  try {
    await program.parseAsync(args, { from: "user" });
    return { stderr: stderr(), stdout };
  } catch (error) {
    return { error, stderr: stderr(), stdout };
  } finally {
    writeSpy.mockRestore();
  }
}

beforeEach(() => {
  process.env.ISSUECTL_AGENT_TOKEN = "env-token";
  delete process.env.ISSUECTL_SERVER_URL;
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ accepted: true, duplicate: false }),
  })));
});

afterEach(() => {
  delete process.env.ISSUECTL_AGENT_TOKEN;
  if (originalIssuectlServerUrl === undefined) {
    delete process.env.ISSUECTL_SERVER_URL;
  } else {
    process.env.ISSUECTL_SERVER_URL = originalIssuectlServerUrl;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("agent commands", () => {
  it("posts completion using ISSUECTL_AGENT_TOKEN instead of a token flag", async () => {
    const result = await parseCommand([
      "agent",
      "complete",
      "--server-url",
      "http://localhost:3847",
      "--deployment",
      "12",
      "--status",
      "completed",
      "--summary",
      "done",
      "--final-head-sha",
      "head-b",
      "--pushed-commit-sha",
      "fix-b",
    ]);

    expect(result.error).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3847/api/v1/agent/completion",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          deploymentId: 12,
          completionToken: "env-token",
          status: "completed",
          summary: "done",
          finalHeadSha: "head-b",
          pushedCommitSha: "fix-b",
        }),
      }),
    );
    expect(result.stdout).toContain("accepted");
  });

  it("uses ISSUECTL_SERVER_URL as the default daemon URL", async () => {
    process.env.ISSUECTL_SERVER_URL = "http://localhost:4999/";

    const result = await parseCommand([
      "agent",
      "complete",
      "--deployment",
      "12",
      "--status",
      "no_changes",
      "--summary",
      "done",
    ]);

    expect(result.error).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4999/api/v1/agent/completion",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("posts mutation requests through the daemon gateway", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ allowed: false, reason: "action_unimplemented" }),
    } as Response);

    const result = await parseCommand([
      "agent",
      "mutate",
      "--deployment",
      "12",
      "--repo-id",
      "1",
      "--target",
      "pr#44",
      "--action",
      "push",
    ]);

    expect(result.error).toBeInstanceOf(CommanderError);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3847/api/v1/agent/mutations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          deploymentId: 12,
          completionToken: "env-token",
          repoId: 1,
          targetType: "pr",
          targetNumber: 44,
          actionType: "push",
        }),
      }),
    );
    expect(result.stderr).toContain("action_unimplemented");
  });

  it("posts inline JSON mutation payloads", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ allowed: true }),
    } as Response);

    const result = await parseCommand([
      "agent",
      "mutate",
      "--deployment",
      "12",
      "--repo-id",
      "1",
      "--target",
      "pr#44",
      "--action",
      "comment",
      "--payload",
      "{\"body\":\"Review complete.\"}",
    ]);

    expect(result.error).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3847/api/v1/agent/mutations",
      expect.objectContaining({
        body: expect.stringContaining("\"payload\":{\"body\":\"Review complete.\"}"),
      }),
    );
    expect(result.stdout).toContain("allowed");
  });

  it("posts JSON mutation payloads from a file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "issuectl-agent-"));
    const payloadPath = join(dir, "payload.json");
    await writeFile(payloadPath, JSON.stringify({
      expectedHeadRef: "feature/review",
      expectedHeadSha: "head-a",
      newSha: "head-b",
    }));
    try {
      await parseCommand([
        "agent",
        "mutate",
        "--deployment",
        "12",
        "--repo-id",
        "1",
        "--target",
        "pr#44",
        "--action",
        "push",
        "--payload-file",
        payloadPath,
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3847/api/v1/agent/mutations",
      expect.objectContaining({
        body: expect.stringContaining("\"newSha\":\"head-b\""),
      }),
    );
  });

  it("rejects malformed JSON payloads before posting", async () => {
    const result = await parseCommand([
      "agent",
      "mutate",
      "--deployment",
      "12",
      "--repo-id",
      "1",
      "--target",
      "pr#44",
      "--action",
      "comment",
      "--payload",
      "{nope",
    ]);

    expect(result.error).toBeInstanceOf(CommanderError);
    expect(result.stderr).toContain("--payload must be valid JSON");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects missing ISSUECTL_AGENT_TOKEN without offering a token option", async () => {
    delete process.env.ISSUECTL_AGENT_TOKEN;

    const result = await parseCommand([
      "agent",
      "complete",
      "--deployment",
      "12",
      "--status",
      "completed",
      "--summary",
      "done",
    ]);

    expect(result.error).toBeInstanceOf(CommanderError);
    expect(result.stderr).toContain("ISSUECTL_AGENT_TOKEN");
    expect(fetch).not.toHaveBeenCalled();
  });
});
