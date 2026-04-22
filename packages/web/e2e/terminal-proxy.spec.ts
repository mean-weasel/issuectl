import { test, expect } from "@playwright/test";

test.describe("terminal proxy", () => {
  test("returns 404 for invalid port", async ({ request }) => {
    const res = await request.get("/api/terminal/9999/");
    expect(res.status()).toBe(404);
  });

  test("returns 404 for non-numeric port", async ({ request }) => {
    const res = await request.get("/api/terminal/abc/");
    expect(res.status()).toBe(404);
  });

  test("returns 404 or 502 for port in range with no active deployment", async ({ request }) => {
    // Port 7799 is in the ttyd range but unlikely to have a deployment.
    // - 404 if no deployment row exists for this port (validation rejects)
    // - 502 if somehow a row exists but ttyd isn't running (ECONNREFUSED)
    // Either response is correct proxy behavior.
    const res = await request.get("/api/terminal/7799/");
    expect([404, 502]).toContain(res.status());
  });
});
