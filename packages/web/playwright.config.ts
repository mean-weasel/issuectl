import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3847",
    trace: "on-first-retry",
  },
});
