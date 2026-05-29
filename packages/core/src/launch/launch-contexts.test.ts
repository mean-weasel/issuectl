import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAgentEnvironment,
  resolveIssuectlCliPath,
} from "./launch-contexts.js";

describe("buildAgentEnvironment", () => {
  const previousIssuectlCli = process.env.ISSUECTL_CLI;
  const previousIssuectlServerUrl = process.env.ISSUECTL_SERVER_URL;
  const previousPort = process.env.PORT;

  afterEach(() => {
    restoreEnv("ISSUECTL_CLI", previousIssuectlCli);
    restoreEnv("ISSUECTL_SERVER_URL", previousIssuectlServerUrl);
    restoreEnv("PORT", previousPort);
  });

  it("provides the local dashboard URL when the web process has no explicit server URL", () => {
    process.env.ISSUECTL_CLI = "/opt/issuectl/bin/issuectl";
    delete process.env.ISSUECTL_SERVER_URL;
    process.env.PORT = "4999";

    expect(buildAgentEnvironment({
      completionToken: "token-1",
      deploymentId: 17,
      repoId: 3,
      targetType: "issue",
      targetNumber: 506,
    })).toMatchObject({
      ISSUECTL_CLI: "/opt/issuectl/bin/issuectl",
      ISSUECTL_SERVER_URL: "http://localhost:4999",
      ISSUECTL_DEPLOYMENT_ID: "17",
      ISSUECTL_REPO_ID: "3",
      ISSUECTL_TARGET_TYPE: "issue",
      ISSUECTL_TARGET_NUMBER: "506",
    });
  });
});

describe("resolveIssuectlCliPath", () => {
  it("resolves the sibling CLI dist file from a built core dist module", async () => {
    const root = await mkdtemp(join(tmpdir(), "issuectl-cli-path-"));
    try {
      const coreDist = join(root, "packages", "core", "dist");
      const cliDist = join(root, "packages", "cli", "dist");
      await mkdir(coreDist, { recursive: true });
      await mkdir(cliDist, { recursive: true });
      const cliPath = join(cliDist, "index.js");
      await writeFile(cliPath, "#!/usr/bin/env node\n");

      expect(resolveIssuectlCliPath(
        {},
        pathToFileURL(join(coreDist, "index.js")).href,
      )).toBe(cliPath);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
