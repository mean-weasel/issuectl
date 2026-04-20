import { defineConfig } from "tsup";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../..");

function resolveVersion(): string {
  try {
    return execFileSync("git", ["tag", "--sort=-v:refname", "-l", "v*"], {
      cwd: rootDir,
      encoding: "utf-8",
    }).split("\n")[0].trim().replace(/^v/, "");
  } catch {
    return JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8")).version;
  }
}

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  dts: true,
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  define: {
    __APP_VERSION__: JSON.stringify(resolveVersion()),
  },
});
