# Workbench UX Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the web workbench usable and testable across desktop, tablet, and mobile by fixing clipping, touch controls, mobile forms, workflow recovery, accessibility semantics, and flaky e2e isolation.

**Architecture:** Keep the existing workbench component structure. Add a real compact/mobile shell mode in CSS, preserve repo context in workbench URLs, make terminal reconnect self-contained, replace weak interactive semantics, and harden Playwright fixtures so failures point at app behavior rather than stale dev servers.

**Tech Stack:** Next.js 15, React 19, CSS Modules, Playwright 1.59, Vitest, SQLite fixture DB via `@issuectl/core`.

---

## File Structure

- Modify `packages/web/components/workbench/WorkbenchShell.module.css`: responsive grid, mobile header controls, focus pane sizing, board/settings/quick-create reusable classes.
- Modify `packages/web/components/workbench/WorkbenchShell.tsx`: preserve `repo` across mode URLs; hide desktop-only resize handles on compact viewports if CSS collapses panes; keep drawer behavior coherent.
- Modify `packages/web/components/workbench/SettingsFocus.tsx`: replace fixed inline two-column grids with responsive CSS classes.
- Modify `packages/web/components/workbench/QuickCreateFocus.tsx`: replace inline max-width/form/card styles with responsive CSS classes where needed.
- Modify `packages/web/components/workbench/BoardFocus.tsx`: make board horizontal scrolling explicit and fitted inside the focus pane.
- Modify `packages/web/components/workbench/IssueQueuePane.tsx`: change issue cards to semantic buttons and make filters either real segmented buttons or fully keyboard-compliant tabs.
- Modify `packages/web/components/workbench/TerminalFocus.tsx`: always provide retry/reconnect from error states.
- Modify `packages/web/e2e/workbench.spec.ts`: isolate server port, reject stale servers, add mobile/tablet visual assertions, add workflow regression coverage.

---

### Task 1: Harden Workbench E2E Server Isolation

**Files:**
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Write failing harness assertions**

Add a health token guard so `waitForServer` cannot accept a stale server on fixed port `3859`.

```ts
const TEST_PORT = Number(process.env.ISSUECTL_WORKBENCH_E2E_PORT ?? "3859");
const BASE_URL = `http://localhost:${TEST_PORT}`;
const SERVER_MARKER = `workbench-e2e-${process.pid}-${Date.now()}`;
```

After the server starts, route marker reads through an env value exposed by the test process. If the app has no marker endpoint, use `/workbench` response text plus token-auth checks in the first test; the key behavior is that the fixture must fail fast when another server owns the port.

- [ ] **Step 2: Implement dynamic port allocation**

Add a helper near the top of the spec:

```ts
async function findFreePort(): Promise<number> {
  const { createServer } = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address?.port) resolve(address.port);
        else reject(new Error("Unable to allocate free port"));
      });
    });
  });
}
```

Change `TEST_PORT` from a constant to `let testPort = 0; let baseUrl = "";`, assign in `beforeAll`, and replace `BASE_URL` references with `baseUrl`.

- [ ] **Step 3: Isolate Next build output**

In the `spawn("npx", ["next", "dev", ...])` env, add:

```ts
NEXT_DIST_DIR: join(tmpDir, ".next"),
ISSUECTL_E2E_MARKER: SERVER_MARKER,
```

Keep all temporary outputs under `tmpDir`; do not write screenshot artifacts or Next cache into tracked repo paths during ordinary tests.

- [ ] **Step 4: Run focused harness tests**

Run:

```bash
PLAYWRIGHT_HTML_OPEN=never pnpm --dir packages/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "renders the production shell|deep links workbench subpaths|empty repositories add action" --output=/tmp/issuectl-workbench-harness
```

Expected: all selected tests pass without retry-only success caused by `ERR_CONNECTION_REFUSED`, stale bearer tokens, or `beforeAll` timeout.

- [ ] **Step 5: Commit**

```bash
git add packages/web/e2e/workbench.spec.ts
git commit -m "test: isolate workbench e2e server"
```

---

### Task 2: Add Failing Responsive Workbench Coverage

**Files:**
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Replace the narrow-header-only test**

Rename `keeps compact header controls reachable on narrow viewports without certifying body layout` to:

```ts
test("keeps compact workbench layouts usable on tablet and mobile", async ({ page }) => {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 768, height: 850 },
    { width: 393, height: 852 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/workbench`);

    await expect(page.getByRole("link", { name: "issuectl workbench" })).toBeVisible();
    await expect(page.getByLabel("Workbench layout controls")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Workbench navigation" })).toBeVisible();
    await expectNoHorizontalPageScroll(page);
    await expectWorkbenchFitsViewport(page);

    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page).toHaveURL(new RegExp("/workbench/settings"));
    await expectNoHorizontalPageScroll(page);
    await expectWorkbenchFitsViewport(page);
    await expect(page.getByLabel("Cache TTL")).toBeVisible();

    await page.getByRole("button", { name: "Quick Create" }).click();
    await page.getByLabel("Parse text").fill("Fix compact workbench layout");
    await expect(page.getByLabel("Parse text")).toHaveValue("Fix compact workbench layout");
    await expectNoHorizontalPageScroll(page);
    await expectWorkbenchFitsViewport(page);
  }
});
```

- [ ] **Step 2: Add viewport fit helper**

Add near the existing helpers:

```ts
async function expectWorkbenchFitsViewport(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => {
    const workbench = document.querySelector<HTMLElement>('main[aria-label="Workbench"]');
    const focus = document.querySelector<HTMLElement>('[aria-label="Workbench focus"]');
    const viewportWidth = window.innerWidth;
    const workbenchRect = workbench?.getBoundingClientRect();
    const focusRect = focus?.getBoundingClientRect();
    return {
      pageOverflow: document.documentElement.scrollWidth - viewportWidth,
      workbenchOverflow: workbench ? workbench.scrollWidth - workbench.clientWidth : 0,
      workbenchLeft: workbenchRect?.left ?? 0,
      workbenchRight: workbenchRect?.right ?? 0,
      focusLeft: focusRect?.left ?? 0,
      focusRight: focusRect?.right ?? 0,
    };
  });
  expect(overflow.pageOverflow).toBeLessThanOrEqual(1);
  expect(overflow.workbenchLeft).toBeGreaterThanOrEqual(0);
  expect(overflow.workbenchRight).toBeLessThanOrEqual((await page.viewportSize())!.width + 1);
  expect(overflow.focusLeft).toBeGreaterThanOrEqual(0);
  expect(overflow.focusRight).toBeLessThanOrEqual((await page.viewportSize())!.width + 1);
  expect(overflow.workbenchOverflow).toBeLessThanOrEqual(1);
}
```

- [ ] **Step 3: Run and verify it fails before CSS fixes**

Run:

```bash
PLAYWRIGHT_HTML_OPEN=never pnpm --dir packages/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "compact workbench layouts" --output=/tmp/issuectl-workbench-responsive-red
```

Expected before implementation: fail on mobile/tablet overflow or offscreen focus pane.

- [ ] **Step 4: Commit tests**

```bash
git add packages/web/e2e/workbench.spec.ts
git commit -m "test: cover compact workbench layout"
```

---

### Task 3: Implement Compact Workbench Shell Layout

**Files:**
- Modify: `packages/web/components/workbench/WorkbenchShell.module.css`
- Modify: `packages/web/components/workbench/WorkbenchShell.tsx`

- [ ] **Step 1: Add compact CSS variables and mobile grid**

Append below the existing workbench grid rules:

```css
@media (max-width: 1099px) {
  .page {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .topbar {
    min-height: 54px;
    height: auto;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      "brand tools"
      "nav nav";
    align-items: center;
    row-gap: 6px;
    padding: 8px 10px;
  }

  .brand {
    grid-area: brand;
  }

  .toolbarTools {
    grid-area: tools;
    justify-self: end;
    max-width: 100%;
    overflow-x: auto;
  }

  .topnav {
    grid-area: nav;
    width: 100%;
    justify-content: flex-start;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .navButton,
  .resetColumnsButton,
  .drawerControls button,
  .paneCollapseButton,
  .repoButton,
  .railButton {
    min-height: 44px;
  }

  .workbench {
    grid-template-columns: var(--repo-rail-width, 68px) minmax(0, 1fr);
    overflow: hidden;
  }

  .workbench[data-side-panes="visible"],
  .workbench[data-side-panes="visible"][data-instances-pane="collapsed"][data-issues-pane="visible"],
  .workbench[data-side-panes="visible"][data-instances-pane="visible"][data-issues-pane="collapsed"],
  .workbench[data-side-panes="visible"][data-instances-pane="collapsed"][data-issues-pane="collapsed"] {
    grid-template-columns: var(--repo-rail-width, 68px) minmax(0, 1fr);
  }

  .instancePane,
  .issuePane,
  .columnResizeHandle,
  .drawerRestoreButton {
    display: none;
  }

  .repoRail {
    width: var(--repo-rail-width, 68px);
    padding: 10px 6px;
  }

  .repoButton,
  .railButton,
  .emptyRailMark,
  .repoSkeleton {
    width: 44px;
    height: 44px;
  }

  .focusPane {
    min-width: 0;
    width: 100%;
  }

  .focusInner {
    max-width: none;
    width: 100%;
    padding: 22px 16px;
  }
}

@media (max-width: 360px) {
  .topbar {
    padding-inline: 8px;
  }

  .brand {
    font-size: 20px;
  }

  .workbench {
    grid-template-columns: 60px minmax(0, 1fr);
  }

  .repoRail {
    width: 60px;
  }
}
```

- [ ] **Step 2: Keep drawer controls truthful on compact layouts**

In `WorkbenchShell.tsx`, keep buttons present only when their panes can appear:

```tsx
<main
  className={styles.workbench}
  data-mode={selection.mode}
  data-side-panes={hideSidePanes ? "collapsed" : "visible"}
  data-instances-pane={instancesPaneCollapsed ? "collapsed" : "visible"}
  data-issues-pane={issuesPaneCollapsed ? "collapsed" : "visible"}
  data-resizing={resizingColumn ? "true" : undefined}
  style={workbenchStyle}
  aria-label="Workbench"
>
```

Do not add JS viewport listeners unless CSS alone cannot satisfy tests.

- [ ] **Step 3: Run responsive test**

Run:

```bash
PLAYWRIGHT_HTML_OPEN=never pnpm --dir packages/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "compact workbench layouts" --output=/tmp/issuectl-workbench-responsive-green
```

Expected: PASS at `1024`, `768`, `393`, and `320`.

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/workbench/WorkbenchShell.module.css packages/web/components/workbench/WorkbenchShell.tsx
git commit -m "fix: fit workbench shell on compact viewports"
```

---

### Task 4: Move Settings and Quick Create Layouts to Responsive Classes

**Files:**
- Modify: `packages/web/components/workbench/SettingsFocus.tsx`
- Modify: `packages/web/components/workbench/QuickCreateFocus.tsx`
- Modify: `packages/web/components/workbench/WorkbenchShell.module.css`

- [ ] **Step 1: Add reusable responsive classes**

Append to `WorkbenchShell.module.css`:

```css
.settingsSummaryGrid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.settingsFormGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.workbenchField {
  min-width: 0;
  display: grid;
  gap: 6px;
  color: var(--paper-ink-muted);
  font: 700 10px var(--paper-mono);
  text-transform: uppercase;
}

.workbenchInput {
  width: 100%;
  min-width: 0;
  min-height: 38px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid var(--paper-line);
  border-radius: var(--paper-radius-sm);
  background: rgba(255, 255, 255, 0.28);
  color: var(--paper-ink);
  font: 13px var(--paper-serif);
  text-transform: none;
}

.quickCreatePanel {
  display: grid;
  gap: 16px;
  max-width: 920px;
  min-width: 0;
}

.quickCreateCard {
  min-width: 0;
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--paper-line);
  border-radius: var(--paper-radius-md);
  background: rgba(255, 255, 255, 0.22);
}

@media (max-width: 700px) {
  .settingsSummaryGrid,
  .settingsFormGrid {
    grid-template-columns: minmax(0, 1fr);
  }

  .quickCreatePanel {
    max-width: none;
  }
}
```

- [ ] **Step 2: Replace settings inline grids**

In `SettingsFocus.tsx`, change:

```tsx
<dl className={styles.settingsSummaryGrid}>
...
<div className={styles.settingsFormGrid}>
...
<label className={styles.workbenchField}>
...
className={styles.workbenchInput}
```

Keep `sectionStyle`, `headingStyle`, `labelStyle`, `statusStyle`, and `errorStyle` only if they still do not affect width.

- [ ] **Step 3: Replace quick-create panel/card/field/input styles**

In `QuickCreateFocus.tsx`, use:

```tsx
<div className={styles.quickCreatePanel}>
<label className={styles.workbenchField}>
<textarea className={styles.workbenchInput} ... />
<section className={styles.quickCreateCard}>
```

Remove any inline style that sets fixed width or misses `minWidth: 0` for mobile form controls.

- [ ] **Step 4: Run compact workflow test**

Run:

```bash
PLAYWRIGHT_HTML_OPEN=never pnpm --dir packages/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "compact workbench layouts" --output=/tmp/issuectl-workbench-forms
```

Expected: PASS, including `Settings` and `Quick Create` on `320x568`.

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/workbench/SettingsFocus.tsx packages/web/components/workbench/QuickCreateFocus.tsx packages/web/components/workbench/WorkbenchShell.module.css
git commit -m "fix: make workbench forms responsive"
```

---

### Task 5: Make Board Mobile Scrolling Explicit

**Files:**
- Modify: `packages/web/components/workbench/BoardFocus.tsx`
- Modify: `packages/web/components/workbench/WorkbenchShell.module.css`
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Add board fit assertion**

Extend the compact test after navigating to board:

```ts
await page.getByRole("button", { name: "Board" }).click();
await expect(page.getByLabel("Cross-repo board")).toBeVisible();
await expectNoHorizontalPageScroll(page);
await expectWorkbenchFitsViewport(page);
await expect(page.getByLabel("Cross-repo board")).toHaveCSS("overflow-x", "auto");
```

- [ ] **Step 2: Add CSS classes**

```css
.boardFocus {
  max-width: none;
  width: 100%;
  min-height: 100%;
  overflow: hidden;
}

.boardScroll {
  display: grid;
  grid-template-columns: repeat(4, minmax(190px, 1fr));
  gap: 12px;
  min-height: 0;
  max-width: 100%;
  overflow-x: auto;
  padding-bottom: 12px;
  overscroll-behavior-x: contain;
}

@media (max-width: 700px) {
  .boardScroll {
    grid-auto-flow: column;
    grid-auto-columns: minmax(190px, 82vw);
    grid-template-columns: none;
  }
}
```

- [ ] **Step 3: Use classes in `BoardFocus.tsx`**

Replace the outer inline style with:

```tsx
<div className={`${styles.focusInner} ${styles.boardFocus}`}>
```

Replace the board container inline grid style with:

```tsx
<div aria-label="Cross-repo board" className={styles.boardScroll}>
```

- [ ] **Step 4: Run board responsive tests**

```bash
PLAYWRIGHT_HTML_OPEN=never pnpm --dir packages/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "compact workbench layouts|responsive QA layout matrix" --output=/tmp/issuectl-workbench-board
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/workbench/BoardFocus.tsx packages/web/components/workbench/WorkbenchShell.module.css packages/web/e2e/workbench.spec.ts
git commit -m "fix: contain workbench board on mobile"
```

---

### Task 6: Preserve Repo Context Across Mode Changes

**Files:**
- Modify: `packages/web/components/workbench/WorkbenchShell.tsx`
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Add failing e2e coverage**

Add a test near the top-nav tests:

```ts
test("preserves selected repo across global mode reloads", async ({ page }) => {
  await gotoWorkbenchWithRetry(page);
  await page.getByRole("button", { name: "mean-weasel/bugdrop" }).click();
  await expect(page).toHaveURL(/repo=mean-weasel%2Fbugdrop/);

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/workbench\/settings\?repo=mean-weasel%2Fbugdrop$/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "mean-weasel/bugdrop" })).toBeVisible();

  await page.getByRole("button", { name: "PRs" }).click();
  await expect(page).toHaveURL(/\/workbench\/prs\?repo=mean-weasel%2Fbugdrop$/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "mean-weasel/bugdrop" })).toHaveAttribute("data-selected", "true");
});
```

- [ ] **Step 2: Implement contextual mode paths**

Add helper in `WorkbenchShell.tsx`:

```ts
function modePathWithRepo(path: string): string {
  if (!selectedRepo) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}repo=${encodeURIComponent(`${selectedRepo.owner}/${selectedRepo.name}`)}`;
}
```

Change nav click:

```tsx
onClick={() => selectMode(item.mode, modePathWithRepo(item.path))}
```

Also change repo rail settings handler:

```tsx
onOpenSettings={() => selectMode("settings", modePathWithRepo("/workbench/settings"))}
```

- [ ] **Step 3: Run repo context test**

```bash
PLAYWRIGHT_HTML_OPEN=never pnpm --dir packages/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "preserves selected repo" --output=/tmp/issuectl-workbench-repo-context
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/workbench/WorkbenchShell.tsx packages/web/e2e/workbench.spec.ts
git commit -m "fix: preserve workbench repo context"
```

---

### Task 7: Fix Terminal Error Retry

**Files:**
- Modify: `packages/web/components/workbench/TerminalFocus.tsx`
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Add failing terminal retry test**

Add:

```ts
test("shows terminal reconnect after terminal auth failure", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/v1/deployments/101/ensure-ttyd", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "temporary terminal failure" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ port: 7701, terminalToken: "terminal-token-101" }),
    });
  });
  await mockTerminalPage(page, 7701, "terminal-token-101");
  await page.goto(`${baseUrl}/workbench?repo=mean-weasel%2Fissuectl&deployment=101`);
  await expect(page.getByRole("heading", { name: "Terminal unavailable" })).toBeVisible();
  await page.getByRole("button", { name: "Reconnect terminal" }).click();
  await expect(page.locator('iframe[title="Terminal for issue 447"]')).toBeVisible();
});
```

- [ ] **Step 2: Always render reconnect when deployment can reconnect**

In `TerminalFocus.tsx`, replace:

```tsx
{terminal.port && terminal.token && (
```

with:

```tsx
{deployment.ttydPort && (
```

Keep the button handler as:

```tsx
onClick={() => setRetryAttempt((current) => current + 1)}
```

- [ ] **Step 3: Run terminal retry test**

```bash
PLAYWRIGHT_HTML_OPEN=never pnpm --dir packages/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "terminal reconnect" --output=/tmp/issuectl-workbench-terminal
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/workbench/TerminalFocus.tsx packages/web/e2e/workbench.spec.ts
git commit -m "fix: allow terminal reconnect after auth failure"
```

---

### Task 8: Improve Issue Queue Accessibility Semantics

**Files:**
- Modify: `packages/web/components/workbench/IssueQueuePane.tsx`
- Modify: `packages/web/components/workbench/WorkbenchShell.module.css`
- Modify: `packages/web/e2e/workbench.spec.ts`

- [ ] **Step 1: Add e2e role assertions**

Add:

```ts
test("exposes issue queue actions with semantic controls", async ({ page }) => {
  await gotoWorkbenchWithRetry(page);
  const filters = page.getByRole("group", { name: "Issue filters" });
  await expect(filters.getByRole("button", { name: /Open work/ })).toHaveAttribute("aria-pressed", "true");
  await filters.getByRole("button", { name: /Running/ }).click();
  await expect(filters.getByRole("button", { name: /Running/ })).toHaveAttribute("aria-pressed", "true");

  const issue = page.getByRole("button", { name: /Issue #512/ });
  await issue.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "#512 Desktop instance manager workbench" })).toBeVisible();
});
```

- [ ] **Step 2: Change filters from tabs to segmented buttons**

Replace:

```tsx
<div className={styles.issueFilters} role="tablist" aria-label="Issue filters">
...
role="tab"
aria-selected={filter === item.id}
```

with:

```tsx
<div className={styles.issueFilters} role="group" aria-label="Issue filters">
...
aria-pressed={filter === item.id}
```

- [ ] **Step 3: Change issue card root to a button**

Replace `<article ... tabIndex={0}>` with:

```tsx
<button
  type="button"
  className={styles.issueCard}
  data-selected={selected ? "true" : undefined}
  data-status={status}
  aria-label={`Issue #${issue.number}: ${issue.title}`}
  onClick={openDetails}
>
```

Close with `</button>`. Keep the nested `Jump to session` and `Prepare launch` buttons out of this root; if nesting buttons would result, change the card root to a link-like div with `role="button"` only for this task. Preferred implementation is to remove the nested secondary button and make the whole row perform the primary action, with a separate sibling action if needed.

- [ ] **Step 4: Adjust CSS for button card**

Add:

```css
.issueCard {
  width: 100%;
  text-align: left;
}
```

Ensure existing `.issueActions button` styling still applies.

- [ ] **Step 5: Run accessibility test**

```bash
PLAYWRIGHT_HTML_OPEN=never pnpm --dir packages/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "semantic controls" --output=/tmp/issuectl-workbench-a11y
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/components/workbench/IssueQueuePane.tsx packages/web/components/workbench/WorkbenchShell.module.css packages/web/e2e/workbench.spec.ts
git commit -m "fix: improve workbench issue queue semantics"
```

---

### Task 9: Run Full Verification and Clean Artifacts

**Files:**
- Modify only if previous tasks missed imports or selectors.

- [ ] **Step 1: Run unit/component tests**

```bash
pnpm --filter @issuectl/web test
```

Expected: all Vitest tests pass.

- [ ] **Step 2: Run focused full workbench e2e**

```bash
PLAYWRIGHT_HTML_OPEN=never pnpm --dir packages/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep-invert "captures workbench QA screenshots" --output=/tmp/issuectl-workbench-final
```

Expected: PASS with `0 flaky`.

- [ ] **Step 3: Run launch mobile regression**

```bash
PLAYWRIGHT_HTML_OPEN=never pnpm --dir packages/web exec playwright test e2e/launch-ui.spec.ts --project=mobile-chromium --output=/tmp/issuectl-launch-final
```

Expected: PASS.

- [ ] **Step 4: Check dirty files**

```bash
git status --short
```

Expected: only intentional source/test changes. No `packages/web/tmp`, `packages/web/.next`, or generated screenshot artifacts.

- [ ] **Step 5: Final commit**

```bash
git add packages/web
git commit -m "test: verify workbench ux stability"
```

---

## Self-Review

- Spec coverage: mobile clipping, touch targets, settings overflow, quick-create clamping, board scroll, e2e isolation, repo context, terminal retry, issue queue semantics, and responsive Playwright coverage are each mapped to a task.
- Placeholder scan: no task depends on undefined implementation details; each code-affecting step includes concrete snippets and commands.
- Type consistency: all referenced components, labels, paths, and existing test helpers are present in the current codebase. The one implementation caveat is nested buttons in `IssueQueuePane`; Task 8 explicitly calls out the required structural choice.
