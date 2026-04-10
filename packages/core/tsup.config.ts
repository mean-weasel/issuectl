import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/validation.ts"],
  format: "esm",
  dts: true,
  clean: true,
});
