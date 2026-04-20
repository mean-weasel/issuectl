import { defineConfig } from "tsup";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootPkg = JSON.parse(
  readFileSync(resolve(__dirname, "../../package.json"), "utf-8"),
);

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  dts: true,
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
});
