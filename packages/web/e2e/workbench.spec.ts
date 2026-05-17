import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { generateApiToken, initSchema, runMigrations } from "@issuectl/core";

const TEST_PORT = 3859;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let server: ChildProcess | undefined;
let tmpDir: string | undefined;
let dbPath = "";
let apiToken = "";

type FixtureIssue = {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: Array<{ name: string; color: string; description: string | null }>;
  assignees: [];
  user: { login: string; avatarUrl: string };
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  htmlUrl: string;
  priority: "low" | "normal" | "high";
};

type FixtureRepo = ReturnType<typeof repo>;

function waitForServer(url: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      fetch(url)
        .then((res) => {
          if (res.ok || res.status === 404) resolve();
          else if (Date.now() > deadline) reject(new Error("Server timeout"));
          else setTimeout(check, 500);
        })
        .catch(() => {
          if (Date.now() > deadline) reject(new Error("Server timeout"));
          else setTimeout(check, 500);
        });
    };
    check();
  });
}

test.beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "issuectl-e2e-workbench-"));
  dbPath = join(tmpDir, "test.db");
  apiToken = createTestDb(dbPath);
  const fakeGh = join(tmpDir, "gh");
  writeFileSync(
    fakeGh,
    [
      "#!/bin/sh",
      "if [ \"$1\" = \"auth\" ] && [ \"$2\" = \"status\" ]; then",
      "  echo 'Logged in to github.com as jeremy'",
      "  exit 0",
      "fi",
      "if [ \"$1\" = \"auth\" ] && [ \"$2\" = \"token\" ]; then",
      "  echo 'workbench-test-token'",
      "  exit 0",
      "fi",
      "echo \"unexpected gh args: $*\" >&2",
      "exit 1",
      "",
    ].join("\n"),
  );
  chmodSync(fakeGh, 0o755);
  const fakeTmux = join(tmpDir, "tmux");
  writeFileSync(
    fakeTmux,
    [
      "#!/bin/sh",
      "case \"$*\" in",
      "  *issuectl-issuectl-447*) echo 'running tests'; exit 0 ;;",
      "  *issuectl-issuectl-486*) echo 'Error: preview failed'; exit 0 ;;",
      "  *issuectl-issuectl-498*) exit 0 ;;",
      "  *issuectl-bugdrop-440*) echo 'running bugdrop checks'; exit 0 ;;",
      "  *) exit 1 ;;",
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(fakeTmux, 0o755);

  server = spawn("npx", ["next", "dev", "--port", String(TEST_PORT)], {
    cwd: `${import.meta.dirname}/..`,
    env: {
      ...process.env,
      ISSUECTL_DB_PATH: dbPath,
      NEXT_PRIVATE_SKIP_SETUP: "1",
      PATH: `${tmpDir}:${process.env.PATH ?? ""}`,
    },
    stdio: "pipe",
    detached: true,
  });

  await waitForServer(BASE_URL, 60_000);
});

test.beforeEach(async ({ page }) => {
  seedWorkbenchRepos(dbPath);
  await page.addInitScript((token) => {
    window.localStorage.setItem("issuectl.apiToken", token);
  }, apiToken);
});

function createTestDb(path: string): string {
  const db = new Database(path);
  try {
    initSchema(db);
    runMigrations(db);
    return generateApiToken(db);
  } finally {
    db.close();
  }
}

function seedWorkbenchRepos(path: string, repos: FixtureRepo[] = workbenchPayload().repos): void {
  const db = new Database(path);
  try {
    db.prepare("DELETE FROM deployments").run();
    db.prepare("DELETE FROM issue_metadata").run();
    db.prepare("DELETE FROM repos").run();
    db.prepare("DELETE FROM cache").run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("cache_ttl", "99999");
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("branch_pattern", "issue-{number}-{slug}");
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("launch_agent", "codex");

    for (const item of repos) {
      db.prepare(
        "INSERT INTO repos (id, owner, name, local_path, branch_pattern) VALUES (?, ?, ?, ?, ?)",
      ).run(item.id, item.owner, item.name, item.localPath, item.branchPattern);
      db.prepare("INSERT INTO cache (key, data, fetched_at) VALUES (?, ?, datetime('now'))")
        .run(`issues:${item.owner}/${item.name}`, JSON.stringify(item.issues));
      for (const deployment of item.deployments) {
        db.prepare(
          `INSERT INTO deployments
           (id, repo_id, issue_number, agent, branch_name, workspace_mode, workspace_path, state, launched_at, ended_at, ttyd_port, ttyd_pid, idle_since)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          deployment.id,
          item.id,
          deployment.issueNumber,
          deployment.agent,
          deployment.branchName,
          deployment.workspaceMode,
          deployment.workspacePath,
          deployment.state,
          deployment.launchedAt,
          deployment.endedAt,
          deployment.ttydPort,
          deployment.ttydPid,
          deployment.idleSince,
        );
      }
      for (const issue of item.issues) {
        db.prepare(
          "INSERT INTO issue_metadata (repo_id, issue_number, priority, updated_at) VALUES (?, ?, ?, ?)",
        ).run(item.id, issue.number, issue.priority, Date.now());
      }
    }
  } finally {
    db.close();
  }
}

test.afterAll(() => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
  }
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("renders the production shell without prototype controls", async ({ page }) => {
  await gotoWorkbenchWithRetry(page);

  await expect(page.getByRole("link", { name: "issuectl workbench" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Workbench navigation" });
  await expect(nav.getByRole("button")).toHaveText([
    "Issues",
    "Board",
    "PRs",
    "Workbench",
    "Quick Create",
    "Settings",
  ]);
  await expect(page.getByText("Mock state")).toHaveCount(0);
  await expect(page.getByText("Terminal selected")).toHaveCount(0);
  await expect(page.getByText("Issue selected")).toHaveCount(0);
  await expect(page.getByText("Repo selected")).toHaveCount(0);
  await expect(page.getByText("Repo setup")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New shell", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Repositories")).toBeVisible();
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  await expect(page.getByRole("button", { name: "mean-weasel/issuectl" })).toContainText("IC");
  await expect(page.getByRole("button", { name: "mean-weasel/bugdrop" })).toContainText("BD");
  await expect(page.getByRole("button", { name: "mean-weasel/api" })).toContainText("API");
  await expect(page.getByRole("button", { name: "mean-weasel/web" })).toContainText("WEB");
});

test("keeps rail width stable across loading and loaded states", async ({ page }) => {
  await gotoWorkbenchWithRetry(page);
  const rail = page.getByLabel("Repositories");
  await expect(rail).toBeVisible();
  const before = await rail.boundingBox();
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  const after = await rail.boundingBox();

  expect(before?.width).toBe(76);
  expect(after?.width).toBe(before?.width);
});

test("sets the compact rail width at 1100px", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 850 });

  await gotoWorkbenchWithRetry(page);
  const rail = page.getByLabel("Repositories");
  await expect(rail).toBeVisible();
  const box = await rail.boundingBox();

  expect(box?.width).toBe(68);
});

test("resizes workbench columns, persists widths, and resets them", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoWorkbenchWithRetry(page);

  await assertVisibleWorkbenchLayout(page);
  const leftHandle = page.getByRole("separator", { name: "Resize instances column" });
  const rightHandle = page.getByRole("separator", { name: "Resize issues column" });
  await expect(leftHandle).toHaveAttribute("aria-valuemin", "220");
  await expect(rightHandle).toHaveAttribute("aria-valuemax", "420");

  const leftBox = await leftHandle.boundingBox();
  expect(leftBox).not.toBeNull();
  expect(leftBox!.height).toBeGreaterThan(100);
  await expect.poll(async () => page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("aria-label"),
    { x: leftBox!.x + leftBox!.width / 2, y: leftBox!.y + leftBox!.height / 2 },
  )).toBe("Resize instances column");
  await page.mouse.move(leftBox!.x + leftBox!.width / 2, leftBox!.y + leftBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(leftBox!.x + leftBox!.width / 2 + 92, leftBox!.y + leftBox!.height / 2);
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("");

  const rightBox = await rightHandle.boundingBox();
  expect(rightBox).not.toBeNull();
  expect(rightBox!.height).toBeGreaterThan(100);
  await page.mouse.move(rightBox!.x + rightBox!.width / 2, rightBox!.y + rightBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(rightBox!.x + rightBox!.width / 2 - 96, rightBox!.y + rightBox!.height / 2);
  await page.mouse.up();

  await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("issuectl.workbench.columnWidths")))
    .toBe(JSON.stringify({ instances: 360, issues: 420 }));
  await assertVisibleWorkbenchLayout(page);

  await page.getByRole("button", { name: "Reset column widths" }).click();
  await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("issuectl.workbench.columnWidths")))
    .toBe(JSON.stringify({ instances: 284, issues: 348 }));

  await page.setViewportSize({ width: 1100, height: 850 });
  await assertVisibleWorkbenchLayout(page);
});

test("passes the responsive QA layout matrix", async ({ page }) => {
  const matrix = [
    { width: 1440, height: 1000 },
    { width: 1280, height: 900 },
    { width: 1100, height: 850 },
  ];

  for (const viewport of matrix) {
    await page.setViewportSize(viewport);
    await page.goto(`${BASE_URL}/workbench`);
    await expectNavOneRowAndClickable(page);
    await assertVisibleWorkbenchLayout(page);

    await clickNavAndExpect(page, "Issues", "/workbench/issues", true);
    await expectNoHorizontalPageScroll(page);
    await clickNavAndExpect(page, "Settings", "/workbench/settings", true);
    await expectNoHorizontalPageScroll(page);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${BASE_URL}/workbench/board`);
  await expectBoardColumnWidths(page, 240);
  await expectNoHorizontalPageScroll(page);

  await page.setViewportSize({ width: 1100, height: 850 });
  await page.goto(`${BASE_URL}/workbench/board`);
  await expectBoardColumnWidths(page, 220);
  await expectNoHorizontalPageScroll(page);
});

test("captures workbench QA screenshots", async ({ browser }) => {
  const artifactDir = join(import.meta.dirname, "../../../docs/qa/workbench-artifacts");
  mkdirSync(artifactDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript((token) => {
    window.localStorage.setItem("issuectl.apiToken", token);
  }, apiToken);
  const page = await context.newPage();

  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });
  await page.route("**/api/v1/issues/mean-weasel/issuectl/512", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(issueDetailFixture()),
    });
  });
  await page.route("**/api/v1/worktrees/status?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ exists: false, dirty: false, path: null }),
    });
  });
  await page.route("**/api/v1/repos/github?refresh=true", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        repos: Array.from({ length: 24 }, (_, index) => ({
          owner: "mean-weasel",
          name: `candidate-${String(index + 1).padStart(2, "0")}`,
          private: index % 3 === 0,
        })),
        syncedAt: 1_779_000_000,
        isStale: false,
      }),
    });
  });

  try {
    await page.goto(`${BASE_URL}/workbench`);
    await page.getByLabel("Session #447").getByRole("button").first().click();
    await expect(page.locator('iframe[title="Terminal for issue 447"]')).toBeVisible();
    await page.screenshot({ path: join(artifactDir, "workbench-terminal-1440.png"), fullPage: true });

    await page.getByRole("button", { name: "Workbench" }).click();
    await page.getByLabel("Issue #512").getByRole("button", { name: "Details" }).click();
    await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
    await page.screenshot({ path: join(artifactDir, "workbench-issue-1440.png"), fullPage: true });

    await page.goto(`${BASE_URL}/workbench/settings?repoSetup=1`);
    await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
    await page.screenshot({ path: join(artifactDir, "workbench-settings-1440.png"), fullPage: true });

    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.goto(`${BASE_URL}/workbench/board`);
    await expect(page.getByLabel("Cross-repo board")).toBeVisible();
    await page.screenshot({ path: join(artifactDir, "workbench-board-1440.png"), fullPage: true });

    await page.setViewportSize({ width: 1100, height: 850 });
    await page.goto(`${BASE_URL}/workbench`);
    await page.getByLabel("Session #447").getByRole("button").first().click();
    await expect(page.locator('iframe[title="Terminal for issue 447"]')).toBeVisible();
    await page.screenshot({ path: join(artifactDir, "workbench-terminal-1100.png"), fullPage: true });
  } finally {
    await context.close();
  }
});

test("collapses instance sections and preserves collapse state across repo changes", async ({ page }) => {
  await page.goto(`${BASE_URL}/workbench`);

  const issueSessionsToggle = page.getByRole("button", { name: "Toggle sessions section" });
  const namedShellsToggle = page.getByRole("button", { name: "Toggle named shells section" });
  await expect(issueSessionsToggle).toContainText("Issue sessions 3");
  await expect(namedShellsToggle).toContainText("Named shells 0");

  await issueSessionsToggle.click();
  await expect(issueSessionsToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Issue sessions", { exact: true })).toBeHidden();

  await namedShellsToggle.click();
  await expect(namedShellsToggle).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("button", { name: "mean-weasel/bugdrop" }).click();
  await expect(page.getByRole("button", { name: "Toggle sessions section" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Toggle sessions section" })).toContainText("Issue sessions 1");

  await page.getByRole("button", { name: "Toggle sessions section" }).click();
  await expect(page.getByLabel("Issue sessions").getByRole("article")).toHaveCount(1);
});

test("refreshes server-loaded workbench content", async ({ page }) => {
  await page.goto(`${BASE_URL}/workbench`);
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
});

test("supports top nav modes and collapses side panes for global modes", async ({ page }) => {
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });

  await page.goto(`${BASE_URL}/workbench`);

  await clickNavAndExpect(page, "Issues", "/workbench/issues", true);
  await clickNavAndExpect(page, "Board", "/workbench/board", true);
  await clickNavAndExpect(page, "Settings", "/workbench/settings", true);
  await clickNavAndExpect(page, "PRs", "/workbench/prs", false);
  await clickNavAndExpect(page, "Quick Create", "/workbench/quick-create", false);
  await page.getByLabel("Session #447").getByRole("button").first().click();
  await expect(page).toHaveURL(new RegExp("/workbench$"));
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toHaveAttribute(
    "src",
    /\/api\/terminal\/7701\/\?terminalToken=terminal-token-101$/,
  );
  await clickNavAndExpect(page, "Workbench", "/workbench", false);
});

test("quick create parses, creates accepted issues, and uses draft endpoints", async ({ page }) => {
  const draftId = "11111111-1111-4111-8111-111111111111";
  const seen = {
    parse: false,
    create: false,
    draftCreate: false,
    draftUpdate: false,
    draftAssign: false,
  };

  await page.route("**/api/v1/parse", async (route) => {
    seen.parse = true;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(await route.request().postDataJSON()).toEqual({
      input: "Fix login timeout and add workbench keyboard shortcuts",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        parsed: {
          suggestedOrder: ["parsed-1", "parsed-2"],
          issues: [
            {
              id: "parsed-1",
              originalText: "Fix login timeout",
              title: "Fix login timeout",
              body: "Sessions should not expire too early.",
              type: "bug",
              repoOwner: null,
              repoName: null,
              repoConfidence: 0.42,
              suggestedLabels: ["bug"],
              clarity: "unknown_repo",
            },
            {
              id: "parsed-2",
              originalText: "Add workbench keyboard shortcuts",
              title: "Add workbench keyboard shortcuts",
              body: "Add shortcuts for common workbench actions.",
              type: "feature",
              repoOwner: "mean-weasel",
              repoName: "issuectl",
              repoConfidence: 0.92,
              suggestedLabels: [],
              clarity: "clear",
            },
          ],
        },
      }),
    });
  });
  await page.route("**/api/v1/parse/create", async (route) => {
    seen.create = true;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(await route.request().postDataJSON()).toEqual({
      issues: [
        {
          id: "parsed-1",
          title: "Fix login timeout",
          body: "Sessions should not expire too early.",
          owner: "mean-weasel",
          repo: "issuectl",
          labels: ["bug"],
          accepted: true,
        },
        {
          id: "parsed-2",
          title: "Add workbench keyboard shortcuts",
          body: "Add shortcuts for common workbench actions.",
          owner: "mean-weasel",
          repo: "issuectl",
          labels: [],
          accepted: false,
        },
      ],
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        created: 1,
        drafted: 0,
        failed: 0,
        results: [{ id: "parsed-1", success: true, issueNumber: 901, owner: "mean-weasel", repo: "issuectl" }],
      }),
    });
  });
  await page.route("**/api/v1/drafts/*/assign", async (route) => {
    seen.draftAssign = true;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(await route.request().postDataJSON()).toEqual({ repoId: 1, labels: ["bug", "workbench"] });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, issueNumber: 902, issueUrl: "https://github.com/mean-weasel/issuectl/902" }),
    });
  });
  await page.route("**/api/v1/drafts/*", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }
    seen.draftUpdate = true;
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(await route.request().postDataJSON()).toEqual({
      title: "Clarify flaky login timeout",
      body: "Saved from the workbench draft fallback.",
      priority: "high",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        draft: {
          id: draftId,
          title: "Clarify flaky login timeout",
          body: "Saved from the workbench draft fallback.",
          priority: "high",
        },
      }),
    });
  });
  await page.route("**/api/v1/drafts", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    seen.draftCreate = true;
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(await route.request().postDataJSON()).toEqual({
      title: "Clarify flaky login timeout",
      body: "Saved from the workbench draft fallback.",
      priority: "high",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, id: draftId }),
    });
  });

  await page.goto(`${BASE_URL}/workbench`);
  await page
    .getByRole("navigation", { name: "Workbench navigation" })
    .getByRole("button", { name: "Quick Create", exact: true })
    .click();

  await expect(page).toHaveURL(new RegExp("/workbench/quick-create$"));
  await expect(page.getByRole("heading", { name: "Quick Create" })).toBeVisible();
  await expect(page.getByLabel("Active sessions")).toBeVisible();
  await expect(page.getByLabel("Repo issues")).toBeVisible();
  await page.getByLabel("Parse text").fill("Fix login timeout and add workbench keyboard shortcuts");
  await page.getByRole("button", { name: "Parse", exact: true }).click();
  await expect(page.getByLabel("Candidate issue 1")).toContainText("accepted");
  await expect(page.getByLabel("Candidate issue 2")).toContainText("accepted");
  await expect(page.getByLabel("Candidate 1 repository")).toHaveValue("mean-weasel/issuectl");
  await page.getByLabel("Candidate issue 2").getByRole("button", { name: "Reject" }).click();
  await expect(page.getByLabel("Candidate issue 2")).toHaveAttribute("data-state", "rejected");
  await page.getByRole("button", { name: "Create accepted issues" }).click();
  await expect(page.getByLabel("Quick create results")).toContainText("1 created, 0 drafted, 0 failed");
  await expect(page.getByLabel("Quick create results")).toContainText("#901");

  await page.getByLabel("Draft title").fill("Clarify flaky login timeout");
  await page.getByLabel("Draft body").fill("Saved from the workbench draft fallback.");
  await page.getByLabel("Draft priority").selectOption("high");
  await page.getByLabel("Draft labels").fill("bug, workbench");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.getByRole("button", { name: "Update draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft updated");
  await page.getByRole("button", { name: "Assign draft" }).click();
  await expect(page.getByRole("status")).toContainText("mean-weasel/issuectl#902");

  expect(seen).toEqual({
    parse: true,
    create: true,
    draftCreate: true,
    draftUpdate: true,
    draftAssign: true,
  });
});

test("pull requests mode loads repo PRs and calls detail review merge comment endpoints", async ({ page }) => {
  const seen = {
    list: false,
    detail: false,
    review: false,
    merge: false,
    comment: false,
    empty: false,
  };

  await page.route("**/api/v1/pulls/mean-weasel/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    expect(request.headers().authorization).toBe(`Bearer ${apiToken}`);

    if (url.pathname === "/api/v1/pulls/mean-weasel/issuectl" && request.method() === "GET") {
      seen.list = true;
      expect(url.searchParams.get("checks")).toBe("true");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pulls: [
            pullFixture(501, {
              title: "Add workbench PR review surface",
              body: "Fixes #512",
              checksStatus: "success",
            }),
            pullFixture(502, {
              title: "Polish session preview copy",
              body: null,
              checksStatus: "pending",
            }),
          ],
          fromCache: false,
          cachedAt: null,
        }),
      });
      return;
    }

    if (url.pathname === "/api/v1/pulls/mean-weasel/web" && request.method() === "GET") {
      seen.empty = true;
      expect(url.searchParams.get("checks")).toBe("true");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ pulls: [], fromCache: false, cachedAt: null }),
      });
      return;
    }

    if (url.pathname === "/api/v1/pulls/mean-weasel/issuectl/501" && request.method() === "GET") {
      seen.detail = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(pullDetailFixture()),
      });
      return;
    }

    if (url.pathname === "/api/v1/pulls/mean-weasel/issuectl/501/review") {
      seen.review = true;
      expect(request.method()).toBe("POST");
      expect(await request.postDataJSON()).toEqual({ event: "APPROVE", body: "Looks good" });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, reviewId: 7001 }),
      });
      return;
    }

    if (url.pathname === "/api/v1/pulls/mean-weasel/issuectl/501/merge") {
      seen.merge = true;
      expect(request.method()).toBe("POST");
      expect(await request.postDataJSON()).toEqual({ mergeMethod: "squash" });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, sha: "abc123" }),
      });
      return;
    }

    if (url.pathname === "/api/v1/pulls/mean-weasel/issuectl/501/comments") {
      seen.comment = true;
      expect(request.method()).toBe("POST");
      expect(await request.postDataJSON()).toEqual({ body: "Workbench PR comment" });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, commentId: 8001 }),
      });
      return;
    }

    await route.fallback();
  });

  await page.goto(`${BASE_URL}/workbench`);
  await page
    .getByRole("navigation", { name: "Workbench navigation" })
    .getByRole("button", { name: "PRs", exact: true })
    .click();

  await expect(page).toHaveURL(new RegExp("/workbench/prs$"));
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  await expect(page.getByLabel("Pull requests for mean-weasel/issuectl")).toContainText("Checks success");
  await expect(page.getByLabel("Pull request #501")).toContainText("Linked issue #512");
  await expect(page.getByLabel("Pull request #501")).toContainText("Needs review");
  await expect(page.getByLabel("Pull request #502")).toContainText("Checks pending");

  await page.getByLabel("Pull request #501").getByRole("button", { name: "Open PR" }).click();
  await expect(page.getByRole("heading", { name: "#501 Add workbench PR review surface" })).toBeVisible();
  await expect(page.getByLabel("Pull request detail")).toContainText("Linked issue #512");
  await expect(page.getByLabel("Pull request detail")).toContainText("Checks: success");

  const pullDetail = page.getByLabel("Pull request detail");
  await pullDetail.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Review approved for #501");
  await pullDetail.getByRole("button", { name: "Merge squash", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("merged with squash");
  await expect(page.getByLabel("Pull request #501")).toContainText("merged");
  await pullDetail.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Comment added to #501");

  await page.getByRole("button", { name: "mean-weasel/web" }).click();
  await page
    .getByRole("navigation", { name: "Workbench navigation" })
    .getByRole("button", { name: "PRs", exact: true })
    .click();
  await expect(page.getByText("No open pull requests in mean-weasel/web.")).toBeVisible();

  expect(seen).toEqual({
    list: true,
    detail: true,
    review: true,
    merge: true,
    comment: true,
    empty: true,
  });
});

test("shows global issues by repo and opens the selected repo issue", async ({ page }) => {
  await page.goto(`${BASE_URL}/workbench`);

  await clickNavAndExpect(page, "Issues", "/workbench/issues", true);
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "mean-weasel/bugdrop" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "mean-weasel/api" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "mean-weasel/web" })).toBeVisible();
  await expect(page.getByLabel("mean-weasel/issuectl issue #447")).toHaveAttribute("data-status", "running");
  await expect(page.getByLabel("mean-weasel/issuectl issue #447")).toContainText("running");

  await page.getByLabel("mean-weasel/bugdrop issue #440").getByRole("button", { name: "Open issue" }).click();

  await expect(page).toHaveURL(new RegExp("/workbench$"));
  await expect(page.getByLabel("Active sessions")).toBeVisible();
  await expect(page.getByLabel("Repo issues")).toBeVisible();
  await expect(page.getByRole("button", { name: "mean-weasel/bugdrop" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "#440 bugdrop issue 1" })).toBeVisible();
});

test("shows cross-repo board columns and reversible running filter", async ({ page }) => {
  await page.route("**/api/v1/issues/mean-weasel/issuectl/512", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(issueDetailFixture()),
    });
  });
  await page.route("**/api/v1/worktrees/status?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ exists: false, dirty: false, path: null }),
    });
  });

  await page.goto(`${BASE_URL}/workbench`);
  await clickNavAndExpect(page, "Board", "/workbench/board", true);

  await expect(page.getByLabel("Repositories")).toBeVisible();
  const board = page.getByLabel("Cross-repo board");
  await expect(board).toBeVisible();
  await expect(board.getByRole("region")).toHaveCount(4);
  await expect(page.getByLabel("Board column mean-weasel/issuectl")).toBeVisible();
  await expect(page.getByLabel("Board column mean-weasel/bugdrop")).toBeVisible();
  await expect(page.getByLabel("Board column mean-weasel/api")).toBeVisible();
  await expect(page.getByLabel("Board column mean-weasel/web")).toBeVisible();
  await expect(page.locator('article[aria-label^="Board issue"]')).toHaveCount(7);

  await page.getByRole("button", { name: "Show running only" }).click();
  await expect(page.locator('article[aria-label^="Board issue"]')).toHaveCount(4);
  await expect(page.getByText("No matching issues.")).toHaveCount(2);
  await expect(board.getByRole("region")).toHaveCount(4);

  await page.getByRole("button", { name: "Show running only" }).click();
  await expect(page.locator('article[aria-label^="Board issue"]')).toHaveCount(7);

  await page.getByRole("button", { name: "Sort by priority" }).click();
  const issuectlCards = page.getByLabel("Board column mean-weasel/issuectl")
    .locator('article[aria-label^="Board issue"]');
  await expect(issuectlCards.first()).toHaveAttribute("aria-label", "Board issue mean-weasel/issuectl #512");

  await page.getByLabel("Board issue mean-weasel/issuectl #512")
    .getByRole("button", { name: "Open issue" })
    .click();
  await expect(page).toHaveURL(new RegExp("/workbench$"));
  await expect(page.getByLabel("Active sessions")).toBeVisible();
  await expect(page.getByLabel("Repo issues")).toBeVisible();
  await expect(page.getByRole("button", { name: "mean-weasel/issuectl" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
});

test("deep links workbench subpaths without a 404", async ({ page }) => {
  await page.goto(`${BASE_URL}/workbench/settings`);
  await expect(page.getByRole("link", { name: "issuectl workbench" })).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Workbench navigation" })
      .getByRole("button", { name: "Settings", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Active sessions")).toHaveCount(0);
  await expect(page.getByLabel("Repo issues")).toHaveCount(0);
});

test("renders settings mode with health and saves settings through APIs", async ({ page }) => {
  await page.route("**/api/v1/settings", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          settings: {
            branch_pattern: "issue-{number}-{slug}",
            cache_ttl: "99999",
            worktree_dir: "/tmp/worktrees",
            launch_agent: "codex",
            claude_extra_args: "--verbose",
            codex_extra_args: "",
            idle_grace_period: "300",
            idle_threshold: "300",
          },
        }),
      });
      return;
    }
    expect(route.request().method()).toBe("PATCH");
    expect(await route.request().postDataJSON()).toEqual({
      branch_pattern: "issue-{number}-{slug}",
      cache_ttl: "120",
      worktree_dir: "/tmp/worktrees",
      launch_agent: "codex",
      claude_extra_args: "--verbose",
      codex_extra_args: "",
      idle_grace_period: "300",
      idle_threshold: "300",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route("**/api/v1/health", async (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, version: "test-version", timestamp: "2026-05-16T16:00:00.000Z" }),
    });
  });
  await page.route("**/api/v1/user", async (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ login: "jeremy" }),
    });
  });

  await page.goto(`${BASE_URL}/workbench/settings`);

  const workbench = page.getByRole("main", { name: "Workbench" });
  await expect(workbench).toHaveAttribute("data-side-panes", "collapsed");
  await expect(page.getByLabel("Active sessions")).toHaveCount(0);
  await expect(page.getByLabel("Repo issues")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Workbench settings" })).toBeVisible();
  await expect(page.getByLabel("Health summary")).toContainText("ok");
  await expect(page.getByLabel("Health summary")).toContainText("jeremy");
  await expect(page.getByLabel("Health summary")).toContainText("4");
  await page.getByRole("button", { name: "Toggle settings health" }).click();
  await expect(page.getByRole("button", { name: "Toggle settings health" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Health summary")).toBeHidden();
  await page.getByRole("button", { name: "Toggle settings health" }).click();
  await page.getByLabel("Cache TTL").fill("120");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await expect(page).toHaveURL(new RegExp("/workbench/settings$"));
  await expect(workbench).toHaveAttribute("data-side-panes", "collapsed");
});

test("opens repo setup and calls add patch delete repo endpoints", async ({ page }) => {
  await page.route("**/api/v1/repos/github?refresh=true", async (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        repos: [
          { owner: "mean-weasel", name: "web", private: false },
          { owner: "mean-weasel", name: "new-tool", private: false },
        ],
        syncedAt: 1_779_000_000,
        isStale: false,
      }),
    });
  });
  await page.route("**/api/v1/repos/mean-weasel/web", async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    if (route.request().method() === "PATCH") {
      expect(await route.request().postDataJSON()).toEqual({
        localPath: "/workspace/web",
        branchPattern: "task-{number}",
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          repo: { ...repo(4, "web", 0), localPath: "/workspace/web", branchPattern: "task-{number}" },
        }),
      });
      return;
    }
    expect(route.request().method()).toBe("DELETE");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route("**/api/v1/repos", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(await route.request().postDataJSON()).toEqual({ owner: "mean-weasel", name: "web" });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, repo: { ...repo(4, "web", 0), localPath: null } }),
    });
  });
  page.on("dialog", async (dialog) => {
    expect(dialog.message()).toBe("Remove mean-weasel/web?");
    await dialog.accept();
  });

  await page.goto(`${BASE_URL}/workbench`);
  await page.getByRole("button", { name: "mean-weasel/web" }).click();
  await page.getByRole("button", { name: "Open repo setup" }).click();
  await expect(page).toHaveURL(new RegExp("/workbench/settings\\?repoSetup=1$"));
  await expect(page.getByRole("heading", { name: "mean-weasel/web" })).toBeVisible();
  await expect(page.getByLabel("Active sessions")).toHaveCount(0);
  await expect(page.getByLabel("Repo issues")).toHaveCount(0);

  await page.getByLabel("Local path").fill("/workspace/web");
  await page.getByLabel("Branch pattern").fill("task-{number}");
  await page.getByRole("button", { name: "Save repo setup" }).click();
  await expect(page.getByText("Repo setup saved")).toBeVisible();

  await page.getByRole("button", { name: "Refresh GitHub repos" }).click();
  await page.getByRole("button", { name: "Remove repository" }).click();
  await expect(page.getByText("mean-weasel/web removed")).toBeVisible();
  await expect(page.getByRole("button", { name: "mean-weasel/web" })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Workbench navigation" })
    .getByRole("button", { name: "Workbench" })
    .click();
  await expect(page).toHaveURL(new RegExp("/workbench$"));
  await expect(page.getByRole("button", { name: "mean-weasel/issuectl" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "mean-weasel/issuectl" })).toBeVisible();

  await page.getByLabel("Repositories").getByRole("button", { name: "Add repository" }).click();
  await expect(page).toHaveURL(new RegExp("/workbench/settings\\?repoSetup=1$"));

  await page.getByLabel("Repository picker").selectOption("mean-weasel/web");
  await page.getByRole("button", { name: "Add selected repo" }).click();
  await expect(page.getByText("mean-weasel/web added")).toBeVisible();
  await expect(page.getByRole("button", { name: "mean-weasel/web" })).toBeVisible();
});

test("selects repos, updates overview focus, and preserves selection across modes", async ({ page }) => {
  await page.goto(`${BASE_URL}/workbench`);
  await page.getByRole("button", { name: "mean-weasel/bugdrop" }).click();
  await expect(page.getByRole("heading", { name: "mean-weasel/bugdrop" })).toBeVisible();
  await expect(page.getByRole("button", { name: "mean-weasel/bugdrop" })).toHaveAttribute("aria-pressed", "true");

  await clickNavAndExpect(page, "Settings", "/workbench/settings", true);
  await clickNavAndExpect(page, "Board", "/workbench/board", true);
  await clickNavAndExpect(page, "Workbench", "/workbench", false);
  await expect(page.getByRole("heading", { name: "mean-weasel/bugdrop" })).toBeVisible();

  await page.getByRole("button", { name: "mean-weasel/api" }).click();
  await expect(page.getByRole("heading", { name: "mean-weasel/api" })).toBeVisible();

  await page.getByRole("button", { name: "mean-weasel/web" }).click();
  await expect(page.getByRole("heading", { name: "mean-weasel/web" })).toBeVisible();
  await expect(page.getByText("Set up local path")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open repo setup" })).toBeVisible();
});

test("shows sorted session previews and opens terminal focus", async ({ page }) => {
  await page.goto(`${BASE_URL}/workbench`);

  const sessions = page.getByLabel("Issue sessions").getByRole("article");
  await expect(sessions).toHaveCount(3);
  await expect(sessions.nth(0)).toContainText("#447");
  await expect(sessions.nth(1)).toContainText("#486");
  await expect(sessions.nth(2)).toContainText("#498");
  await expect(page.getByLabel("Session #486")).toHaveAttribute("data-status", "error");
  await expect(page.getByLabel("Session #486")).toContainText("Error: preview failed");
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });

  await page.getByLabel("Session #447").getByRole("button").first().click();
  await expect(page.getByRole("heading", { name: /#447/ })).toBeVisible();
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toHaveAttribute(
    "src",
    /\/api\/terminal\/7701\/\?terminalToken=terminal-token-101$/,
  );
});

test("reconnects a session through the deployment endpoint", async ({ page }) => {
  await page.route("**/api/v1/deployments/103/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7799, terminalToken: "terminal-token-103" }),
    });
  });

  await page.goto(`${BASE_URL}/workbench`);
  await page.getByLabel("Session #486").getByRole("button", { name: "Reconnect" }).click();

  await expect(page.getByRole("heading", { name: /#486/ })).toBeVisible();
  await expect(page.locator('iframe[title="Terminal for issue 486"]')).toHaveAttribute(
    "src",
    /\/api\/terminal\/7799\/\?terminalToken=terminal-token-103$/,
  );
});

test("ends a session through the deployment endpoint and removes its row", async ({ page }) => {
  await page.route("**/api/v1/deployments/102/end", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(await route.request().postDataJSON()).toEqual({
      owner: "mean-weasel",
      repo: "issuectl",
      issueNumber: 498,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  await page.goto(`${BASE_URL}/workbench`);
  const session = page.getByLabel("Session #498");
  await session.getByText("End", { exact: true }).click();
  await expect(session.getByText("End session?")).toBeVisible();
  await session.getByRole("button", { name: "End session" }).click();

  await expect(page.getByLabel("Session #498")).toHaveCount(0);
  await expect(page.getByLabel("Issue sessions").getByRole("article")).toHaveCount(2);
  await page.getByRole("tab", { name: "Running 2" }).click();
  await expect(page.getByLabel("Issue #498")).toHaveCount(0);
});

test("filters repo issues and links details and running sessions", async ({ page }) => {
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });

  await page.goto(`${BASE_URL}/workbench`);

  await expect(page.getByText("open work 4", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Repo issue queue").getByRole("article")).toHaveCount(4);

  await page.getByRole("tab", { name: "Running 3" }).click();
  await expect(page.getByLabel("Repo issue queue").getByRole("article")).toHaveCount(3);
  await expect(page.getByLabel("Issue #512")).toHaveCount(0);

  await page.getByRole("tab", { name: "Closed 0" }).click();
  await expect(page.getByLabel("Repo issue queue").getByRole("article")).toHaveCount(0);

  await page.getByRole("tab", { name: "Open work 4" }).click();
  await page.getByLabel("Issue #512").getByRole("button", { name: "Details" }).click();
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();

  await page.getByLabel("Issue #447").getByRole("button", { name: "Jump to session" }).click();
  await expect(page.getByRole("heading", { name: /#447/ })).toBeVisible();
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toHaveAttribute(
    "src",
    /\/api\/terminal\/7701\/\?terminalToken=terminal-token-101$/,
  );
});

test("loads issue detail and calls issue mutation endpoints", async ({ page }) => {
  const detailPath = "**/api/v1/issues/mean-weasel/issuectl/512";
  await page.route(detailPath, async (route) => {
    const method = route.request().method();
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    if (method === "GET") {
      await page.waitForTimeout(100);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(issueDetailFixture()),
      });
      return;
    }
    if (method === "PATCH") {
      expect(await route.request().postDataJSON()).toEqual({
        title: "Desktop instance manager workbench updated",
      });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
      return;
    }
    await route.fallback();
  });
  await expectJsonRequest(page, "**/api/v1/issues/mean-weasel/issuectl/512/priority", "PUT", { priority: "normal" });
  await expectJsonRequest(page, "**/api/v1/issues/mean-weasel/issuectl/512/comments", "POST", { body: "Workbench comment" });
  await expectJsonRequest(page, "**/api/v1/issues/mean-weasel/issuectl/512/state", "POST", {
    state: "closed",
    comment: "Closing from workbench",
  });
  await expectJsonRequest(page, "**/api/v1/issues/mean-weasel/issuectl/512/labels", "POST", {
    label: "workbench",
    action: "add",
  });
  await expectJsonRequest(page, "**/api/v1/issues/mean-weasel/issuectl/512/assignees", "PUT", {
    assignees: ["jeremy"],
  });
  await expectJsonRequest(page, "**/api/v1/issues/mean-weasel/issuectl/512/reassign", "POST", {
    targetOwner: "mean-weasel",
    targetRepo: "bugdrop",
  }, { success: true, newOwner: "mean-weasel", newRepo: "bugdrop", newIssueNumber: 612 });
  await page.route("**/api/v1/images/upload", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(route.request().headers()["content-type"]).toContain("multipart/form-data");
    const body = route.request().postData() ?? "";
    expect(body).toContain("workbench.png");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: "https://example.com/workbench.png" }),
    });
  });

  await gotoWorkbenchWithRetry(page);
  await page.getByLabel("Issue #512").getByRole("button", { name: "Launch" }).click();
  await expect(page.getByText("Loading issue #512")).toBeVisible();
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
  await expect(page.locator("strong", { hasText: "bold" })).toBeVisible();
  await expect(page.getByRole("link", { name: "link" })).toHaveAttribute("href", "https://example.com");
  await expect(page.getByText("item")).toBeVisible();
  await expect(page.getByText("#501 terminal-reconnect-fix")).toBeVisible();
  await expect(page.getByText("Deployment 101")).toBeVisible();
  await expect(page.getByText("Cached")).toBeVisible();
  await page.getByRole("button", { name: "Toggle comments section" }).click();
  await expect(page.getByRole("button", { name: "Toggle comments section" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Issue comments")).toBeHidden();
  await page.getByRole("button", { name: "Toggle comments section" }).click();

  const preamble = page.getByPlaceholder("Additional instructions for Codex...");
  await preamble.fill("Keep this launch context");
  await page.getByLabel("Issue actions").getByLabel("Priority").selectOption("normal");
  await expect(page.getByLabel("Issue #512")).toContainText("normal");
  await expect(preamble).toHaveValue("Keep this launch context");
  await page.getByRole("button", { name: "Add comment" }).click();
  await page.getByRole("button", { name: "Close issue" }).click();
  await expect(page.getByLabel("Issue #512")).toHaveCount(0);
  await page.getByRole("tab", { name: "Closed 1" }).click();
  await expect(page.getByLabel("Issue #512")).toBeVisible();
  await page.getByRole("button", { name: "Add label" }).click();
  await page.getByRole("button", { name: "Assign me" }).click();
  await page.getByRole("button", { name: "Attach image" }).click();
  await expect(page.getByRole("button", { name: "Reassign" })).toBeDisabled();
  await page.getByLabel("Reassign target").selectOption("mean-weasel/bugdrop");
  await expect(page.getByRole("button", { name: "Reassign" })).toBeEnabled();
  await page.getByRole("button", { name: "Reassign" }).click();
  await expect(page.getByRole("heading", { name: "#612 Reassigned issue #612" })).toBeVisible();
  await page.getByRole("button", { name: "mean-weasel/issuectl" }).click();
  await page.getByRole("tab", { name: "Closed 1" }).click();
  await expect(page.getByLabel("Issue #512")).toBeVisible();
});

test.skip("empty repositories add action opens repo setup", async ({ page }) => {
  seedWorkbenchRepos(dbPath, []);

  await gotoWorkbenchWithRetry(page);
  await expect(page.getByRole("heading", { name: "No tracked repositories" })).toBeVisible();
  await expect(page.getByLabel("Workbench focus").getByRole("button", { name: "Open settings" })).toBeVisible();
  await page.getByLabel("Workbench focus").getByRole("button", { name: "Add repository" }).click();
  await expect(page).toHaveURL(new RegExp("/workbench/settings\\?repoSetup=1$"));
  await page.goto("about:blank");
});

test("checks worktree status and launches an issue with selected context", async ({ page }) => {
  await page.route("**/api/v1/issues/mean-weasel/issuectl/512", async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(issueDetailFixture()),
    });
  });
  await page.route("**/api/v1/worktrees/status?**", async (route) => {
    const url = new URL(route.request().url());
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(url.searchParams.get("owner")).toBe("mean-weasel");
    expect(url.searchParams.get("repo")).toBe("issuectl");
    expect(url.searchParams.get("issueNumber")).toBe("512");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ exists: true, dirty: true, path: "/tmp/issuectl-512" }),
    });
  });
  await expectJsonRequest(page, "**/api/v1/worktrees/reset", "POST", {
    owner: "mean-weasel",
    repo: "issuectl",
    issueNumber: 512,
  });
  await page.route("**/api/v1/worktrees/cleanup", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, removed: 0 }),
    });
  });

  let launchCount = 0;
  await page.route("**/api/v1/deployments/409/ensure-ttyd", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7790, terminalToken: "terminal-token-409" }),
    });
  });
  await page.route("**/api/v1/launch/mean-weasel/issuectl/512", async (route) => {
    launchCount += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    const body = await route.request().postDataJSON();
    const { idempotencyKey, ...withoutNonce } = body;
    expect(withoutNonce).toEqual({
      agent: "codex",
      branchName: "issue-512-desktop-instance-manager-workbench",
      workspaceMode: "worktree",
      selectedCommentIndices: [0],
      selectedFilePaths: ["packages/web/app/workbench/page.tsx"],
      preamble: "Investigate workbench implementation",
      forceResume: false,
    });
    expect(typeof idempotencyKey).toBe("string");
    expect(idempotencyKey.length).toBeGreaterThanOrEqual(8);
    if (launchCount === 1) {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "This launch is already in progress — please wait." }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, deploymentId: 409, ttydPort: 7790 }),
    });
  });

  await gotoWorkbenchWithRetry(page);
  await page.getByLabel("Issue #512").getByRole("button", { name: "Details" }).click();
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
  await expect(page.getByLabel("Launch options").getByText("Codex", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Launch options").getByText("Claude Code", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Launch options").getByText("Existing repo")).toBeVisible();
  await expect(page.getByLabel("Launch options").getByText("Git worktree")).toBeVisible();
  await expect(page.getByLabel("Launch options").getByText("Fresh clone")).toBeVisible();
  await expect(page.getByLabel("Branch")).toHaveValue("issue-512-desktop-instance-manager-workbench");
  await expect(page.getByText("Dirty worktree warning")).toBeVisible();
  await page.getByRole("button", { name: "Reset worktree" }).click();
  await expect(page.getByText("Dirty worktree warning")).toHaveCount(0);
  await page.getByRole("button", { name: "Cleanup stale" }).click();

  await page.getByRole("button", { name: "Launch issue" }).click();
  await expect(page.getByText("launch failed: This launch is already in progress")).toBeVisible();
  await expect(page.getByLabel("Session #512")).toHaveCount(0);
  await page.getByRole("button", { name: "Launch issue" }).click();
  await expect(page.getByLabel("Session #512")).toBeVisible();
  await expect(page.getByRole("heading", { name: /#512/ })).toBeVisible();
  await expect(page.locator('iframe[title="Terminal for issue 512"]')).toHaveAttribute(
    "src",
    /\/api\/terminal\/7790\/\?terminalToken=terminal-token-409$/,
  );
  await page.goto("about:blank");
});

async function clickNavAndExpect(page: import("@playwright/test").Page, label: string, path: string, collapsed: boolean) {
  const navButton = page
    .getByRole("navigation", { name: "Workbench navigation" })
    .getByRole("button", { name: label, exact: true });
  await navButton.click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(navButton).toHaveAttribute("aria-current", "page");
  const workbench = page.getByRole("main", { name: "Workbench" });
  if (collapsed) {
    await expect(workbench).toHaveAttribute("data-side-panes", "collapsed");
    await expect(page.getByLabel("Active sessions")).toHaveCount(0);
    await expect(page.getByLabel("Repo issues")).toHaveCount(0);
    const workbenchBox = await workbench.boundingBox();
    const repoRailBox = await page.getByLabel("Repositories").boundingBox();
    const focusBox = await page.getByLabel("Workbench focus").boundingBox();
    expect(workbenchBox).not.toBeNull();
    expect(repoRailBox).not.toBeNull();
    expect(focusBox).not.toBeNull();
    expect(Math.round(focusBox!.width)).toBeGreaterThanOrEqual(
      Math.round(workbenchBox!.width - repoRailBox!.width) - 1,
    );
  } else {
    await expect(workbench).toHaveAttribute("data-side-panes", "visible");
    await expect(page.getByLabel("Active sessions")).toBeVisible();
    await expect(page.getByLabel("Repo issues")).toBeVisible();
  }
}

async function gotoWorkbenchWithRetry(page: import("@playwright/test").Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(`${BASE_URL}/workbench`, { waitUntil: "domcontentloaded", timeout: 10_000 });
      return;
    } catch (err) {
      if (attempt === 2) throw err;
      await page.waitForTimeout(500);
    }
  }
}

async function assertVisibleWorkbenchLayout(page: import("@playwright/test").Page) {
  const rail = page.getByLabel("Repositories");
  const instances = page.getByLabel("Active sessions");
  const focus = page.getByLabel("Workbench focus");
  const issues = page.getByLabel("Repo issues");
  await expect(rail).toBeVisible();
  await expect(instances).toBeVisible();
  await expect(focus).toBeVisible();
  await expect(issues).toBeVisible();
  const railBox = await rail.boundingBox();
  const instanceBox = await instances.boundingBox();
  const focusBox = await focus.boundingBox();
  const issueBox = await issues.boundingBox();

  expect(railBox).not.toBeNull();
  expect(instanceBox).not.toBeNull();
  expect(focusBox).not.toBeNull();
  expect(issueBox).not.toBeNull();
  expect(focusBox!.width).toBeGreaterThanOrEqual(440);
  expect(railBox!.x + railBox!.width).toBeLessThanOrEqual(instanceBox!.x + 1);
  expect(instanceBox!.x + instanceBox!.width).toBeLessThanOrEqual(focusBox!.x + 9);
  expect(focusBox!.x + focusBox!.width).toBeLessThanOrEqual(issueBox!.x + 9);
}

async function expectNavOneRowAndClickable(page: import("@playwright/test").Page) {
  const nav = page.getByRole("navigation", { name: "Workbench navigation" });
  const buttons = nav.getByRole("button");
  await expect(buttons).toHaveCount(6);
  const count = await buttons.count();
  const boxes = [];
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    boxes.push(box!);
  }
  const firstTop = Math.round(boxes[0].y);
  for (const box of boxes) {
    expect(Math.abs(Math.round(box.y) - firstTop)).toBeLessThanOrEqual(2);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  for (let index = 1; index < boxes.length; index += 1) {
    expect(boxes[index - 1].x + boxes[index - 1].width).toBeLessThanOrEqual(boxes[index].x + 2);
  }
}

async function expectBoardColumnWidths(page: import("@playwright/test").Page, minimumWidth: number) {
  await expect(page.getByLabel("Cross-repo board")).toBeVisible();
  const columns = page.locator('[aria-label^="Board column "]');
  await expect(columns).toHaveCount(4);
  const focusBox = await page.getByLabel("Workbench focus").boundingBox();
  expect(focusBox).not.toBeNull();
  for (let index = 0; index < 4; index += 1) {
    const box = await columns.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(minimumWidth);
    expect(box!.x).toBeGreaterThanOrEqual(focusBox!.x - 2);
  }
}

async function expectNoHorizontalPageScroll(page: import("@playwright/test").Page) {
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(2);
}

async function expectJsonRequest(
  page: import("@playwright/test").Page,
  url: string,
  method: string,
  expectedBody: Record<string, unknown>,
  responseBody: Record<string, unknown> = { success: true },
) {
  await page.route(url, async (route) => {
    expect(route.request().method()).toBe(method);
    expect(route.request().headers().authorization).toBe(`Bearer ${apiToken}`);
    expect(await route.request().postDataJSON()).toEqual(expectedBody);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responseBody),
    });
  });
}

function issueDetailFixture() {
  return {
    issue: {
      number: 512,
      title: "Desktop instance manager workbench",
      body: "**bold** [link](https://example.com)\\n\\n- item",
      state: "open",
      labels: [{ name: "high", color: "ffffff", description: null }],
      assignees: [],
      user: { login: "jeremy", avatarUrl: "" },
      commentCount: 1,
      createdAt: "2026-05-16T15:00:00.000Z",
      updatedAt: "2026-05-16T16:00:00.000Z",
      closedAt: null,
      htmlUrl: "https://github.com/mean-weasel/issuectl/issues/512",
    },
    comments: [{
      id: 9001,
      body: "Existing comment",
      user: { login: "jeremy", avatarUrl: "" },
      createdAt: "2026-05-16T16:10:00.000Z",
      updatedAt: "2026-05-16T16:10:00.000Z",
      htmlUrl: "https://github.com/mean-weasel/issuectl/issues/512#issuecomment-9001",
    }],
    deployments: [{
      id: 101,
      repoId: 1,
      issueNumber: 447,
      agent: "codex",
      branchName: "issue-447",
      workspaceMode: "worktree",
      workspacePath: "/workspace/issuectl",
      linkedPrNumber: 501,
      launchedAt: "2026-05-16T15:00:00.000Z",
      ttydPort: 7701,
      ttydPid: 1234,
      idleSince: null,
      owner: "mean-weasel",
      repoName: "issuectl",
    }],
    linkedPRs: [{
      number: 501,
      title: "terminal-reconnect-fix",
      state: "open",
      htmlUrl: "https://github.com/mean-weasel/issuectl/pull/501",
    }],
    referencedFiles: ["packages/web/app/workbench/page.tsx"],
    fromCache: true,
    cachedAt: "2026-05-16T16:05:00.000Z",
  };
}

function pullFixture(
  number: number,
  overrides: Partial<{
    title: string;
    body: string | null;
    checksStatus: "success" | "failure" | "pending" | null;
  }> = {},
) {
  return {
    number,
    title: overrides.title ?? `Pull request ${number}`,
    body: overrides.body ?? null,
    state: "open",
    draft: false,
    merged: false,
    user: { login: "jeremy", avatarUrl: "" },
    headRef: `issue-${number}`,
    baseRef: "main",
    additions: 12,
    deletions: 4,
    changedFiles: 3,
    createdAt: "2026-05-16T15:00:00.000Z",
    updatedAt: "2026-05-16T16:00:00.000Z",
    mergedAt: null,
    closedAt: null,
    htmlUrl: `https://github.com/mean-weasel/issuectl/pull/${number}`,
    checksStatus: overrides.checksStatus ?? null,
  };
}

function pullDetailFixture() {
  return {
    pull: pullFixture(501, {
      title: "Add workbench PR review surface",
      body: "Fixes #512",
      checksStatus: "success",
    }),
    checks: [{
      name: "desktop-chromium",
      status: "completed",
      conclusion: "success",
      startedAt: "2026-05-16T16:00:00.000Z",
      completedAt: "2026-05-16T16:02:00.000Z",
      htmlUrl: "https://github.com/mean-weasel/issuectl/actions/runs/1",
    }],
    files: [{
      filename: "packages/web/components/workbench/PullRequestsFocus.tsx",
      status: "added",
      additions: 120,
      deletions: 0,
    }],
    linkedIssue: {
      number: 512,
      title: "Desktop instance manager workbench",
      body: "Build the workbench.",
      state: "open",
      labels: [],
      assignees: [],
      user: { login: "jeremy", avatarUrl: "" },
      commentCount: 0,
      createdAt: "2026-05-16T15:00:00.000Z",
      updatedAt: "2026-05-16T16:00:00.000Z",
      closedAt: null,
      htmlUrl: "https://github.com/mean-weasel/issuectl/issues/512",
    },
    reviews: [],
    fromCache: false,
    cachedAt: null,
  };
}

function workbenchPayload() {
  return {
    repos: [
      repo(1, "issuectl", 3),
      repo(2, "bugdrop", 1),
      { ...repo(3, "api", 0), issueError: "GitHub unavailable for api" },
      { ...repo(4, "web", 0), localPath: null },
    ],
    deployments: [],
    previews: {},
    settings: {},
    health: { ok: true, version: "0.0.0", timestamp: "2026-05-16T16:00:00.000Z", error: null },
    user: { login: "jeremy", error: null },
    generatedAt: "2026-05-16T16:00:00.000Z",
  };
}

function repo(id: number, name: string, deploymentCount: number): {
  id: number;
  owner: string;
  name: string;
  localPath: string | null;
  branchPattern: string | null;
  badgeCount: number;
  deployedCount: number;
  launchAgent: "codex" | null;
  issueError: string | null;
  issuesFromCache: boolean;
  issuesCachedAt: string | null;
  priorities: [];
  deployments: Array<{
    id: number;
    repoId: number;
    issueNumber: number;
    agent: "codex";
    branchName: string;
    workspaceMode: "worktree";
    workspacePath: string;
    linkedPrNumber: null;
    state: "active";
    launchedAt: string;
    endedAt: null;
    ttydPort: number;
    ttydPid: number;
    idleSince: null;
    owner: string;
    repoName: string;
  }>;
  previews: {};
  issues: FixtureIssue[];
} {
  return {
    id,
    owner: "mean-weasel",
    name,
    localPath: `/workspace/${name}`,
    branchPattern: null,
    badgeCount: deploymentCount,
    deployedCount: deploymentCount,
    launchAgent: deploymentCount > 0 ? "codex" : null,
    issueError: null,
    issuesFromCache: false,
    issuesCachedAt: null,
    priorities: [],
    deployments: Array.from({ length: deploymentCount }, (_, index) => ({
      id: deploymentId(id, index),
      repoId: id,
      issueNumber: issueNumber(id, index),
      agent: "codex",
      branchName: `issue-${issueNumber(id, index)}`,
      workspaceMode: "worktree",
      workspacePath: `/workspace/${name}`,
      linkedPrNumber: null,
      state: "active",
      launchedAt: launchedAt(id, index),
      endedAt: null,
      ttydPort: ttydPort(id, index),
      ttydPid: 1234 + index,
      idleSince: null,
      owner: "mean-weasel",
      repoName: name,
    })),
    previews: {},
    issues: Array.from({ length: issueCount(id, deploymentCount) }, (_, index) => ({
      number: issueNumber(id, index),
      title: issueTitle(id, name, index),
      state: "open",
      labels: [],
      assignees: [],
      user: { login: "jeremy", avatarUrl: "" },
      commentCount: 0,
      createdAt: "2026-05-16T15:00:00.000Z",
      updatedAt: "2026-05-16T16:00:00.000Z",
      closedAt: null,
      htmlUrl: `https://github.com/mean-weasel/${name}/issues/${issueNumber(id, index)}`,
      priority: id === 1 && index === 3 ? "high" : "normal",
    })),
  };
}

function issueCount(repoId: number, deploymentCount: number): number {
  if (repoId === 1) return 4;
  return Math.max(1, deploymentCount);
}

function deploymentId(repoId: number, index: number): number {
  if (repoId === 1) return [101, 102, 103][index] ?? 100 + index;
  return repoId * 100 + index;
}

function issueNumber(repoId: number, index: number): number {
  if (repoId === 1) return [447, 498, 486, 512][index] ?? 440 + index;
  return 440 + index;
}

function ttydPort(repoId: number, index: number): number {
  if (repoId === 1) return [7701, 7702, 7703][index] ?? 7700 + index;
  return 7700 + index;
}

function launchedAt(repoId: number, index: number): string {
  if (repoId === 1) {
    return [
      "2026-05-16T15:00:00.000Z",
      "2026-05-16T16:00:00.000Z",
      "2026-05-16T17:00:00.000Z",
    ][index] ?? "2026-05-16T14:00:00.000Z";
  }
  return "2026-05-16T16:00:00.000Z";
}

function issueTitle(repoId: number, name: string, index: number): string {
  if (repoId === 1) {
    return [
      "Mac sidebar follow-up",
      "Terminal resize polish",
      "Preview error state",
      "Desktop instance manager workbench",
    ][index] ?? `${name} issue ${index + 1}`;
  }
  return `${name} issue ${index + 1}`;
}
