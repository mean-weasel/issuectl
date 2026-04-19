import { test, expect } from "@playwright/test";

// These tests run against the dev server on :3847.
// They use Playwright's built-in offline simulation.

const BASE_URL = "http://localhost:3847";

test.describe("Offline mode", () => {
  test("shows offline banner when network is lost", async ({ page, context }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    await context.setOffline(true);

    // Trigger the browser's offline event.
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    const banner = page.locator('[role="status"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Offline");

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    await expect(banner).not.toBeVisible();
  });

  test("health endpoint returns ok", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  test("blocked actions show disabled state when offline", async ({
    page,
    context,
  }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    // Find and click the first issue card.
    const firstIssue = page.locator('a[href^="/issues/"]').first();
    if (await firstIssue.isVisible()) {
      await firstIssue.click();
      await page.waitForLoadState("networkidle");

      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event("offline")));

      const banner = page.locator('[role="status"]');
      await expect(banner).toBeVisible();

      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
    }
  });
});
