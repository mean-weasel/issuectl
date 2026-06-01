import { describe, expect, it } from "vitest";
import { buildWebServerArgs, buildWebServerEnv, resolveIssuectlCliPath } from "./web.js";

describe("web command environment", () => {
  it("passes a deterministic issuectl CLI path and server URL to the web server", () => {
    const env = buildWebServerEnv("4999", {}, "/opt/issuectl/dist/index.js");

    expect(env.PORT).toBe("4999");
    expect(env.ISSUECTL_SERVER_URL).toBe("http://localhost:4999");
    expect(env.ISSUECTL_CLI).toBe("/opt/issuectl/dist/index.js");
  });

  it("preserves explicit operator overrides", () => {
    const env = buildWebServerEnv("4999", {
      ISSUECTL_CLI: "/custom/bin/issuectl",
      ISSUECTL_SERVER_URL: "http://127.0.0.1:7777",
    }, "/opt/issuectl/dist/index.js");

    expect(env.ISSUECTL_CLI).toBe("/custom/bin/issuectl");
    expect(env.ISSUECTL_SERVER_URL).toBe("http://127.0.0.1:7777");
  });

  it("resolves argv entry paths when no CLI override is set", () => {
    expect(resolveIssuectlCliPath({}, "packages/cli/dist/index.js")).toMatch(
      /packages\/cli\/dist\/index\.js$/,
    );
  });

  it("starts the web server with the web package polyfills before tsx", () => {
    expect(buildWebServerArgs("/repo/packages/web")).toEqual([
      "--import",
      "/repo/packages/web/server-polyfills.mjs",
      "--import",
      "tsx",
      "/repo/packages/web/server.ts",
      "--dev",
    ]);
  });
});
