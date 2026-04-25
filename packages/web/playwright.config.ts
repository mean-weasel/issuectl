import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120000,
  retries: 0,
  // Each spec spawns its own next dev server on a unique port. Running
  // multiple in parallel causes CPU/cache contention that flakes timing-
  // sensitive assertions. Serial execution adds ~30s but eliminates an
  // entire class of false failures. Revisit if the suite exceeds 5min.
  workers: 1,
  use: {
    baseURL: "http://localhost:3847",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /(mobile-ux-patterns|launch-ui|launch-flow|action-sheets|pull-to-refresh|issue-close)\.spec\.ts/,
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
      testMatch: /(mobile-ux-patterns|launch-ui|action-sheets|pull-to-refresh|issue-close|viewport-health)\.spec\.ts/,
    },
  ],
});
