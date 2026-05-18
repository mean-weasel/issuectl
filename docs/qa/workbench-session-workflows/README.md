# Workbench Session Lifecycle QA Workflows

These workflows verify `/workbench` issue-backed terminal sessions end to end. They are intentionally safe and repo-scoped: destructive actions must use a designated test repo/issue unless the operator explicitly approves otherwise.

## Scope

Covered workflows:

1. Create an issue session.
2. Return to an active session after browser refresh.
3. Reconnect a stopped ttyd while tmux remains alive.
4. Cancel and confirm ending a session.
5. Reconcile stale deployment/session state.
6. Reopen sessions after restarting the web app.
7. Run a regression matrix that maps workflows to automated coverage.

## Standard Setup

- Local app URL: `http://localhost:3847/workbench`
- Preferred test repo: `mean-weasel/issuectl-test-repo`
- Preferred test issues: issues created specifically for Workbench QA.
- Do not use non-test repos for destructive lifecycle actions.
- Capture artifacts in `docs/qa/workbench-artifacts/`.
- Prefer headless Playwright for repeatability; use headed/manual browser only to inspect ambiguous UI.

## Standard Acceptance Criteria

Every workflow must record:

- The repo and issue number used.
- Whether a session card appeared or disappeared exactly as expected.
- Whether `data-instances-pane` and `data-issues-pane` matched the expected drawer state.
- Whether the terminal iframe was visible and inside the viewport when a terminal should be open.
- Whether endpoint calls happened exactly as expected.
- Whether tmux/ttyd process state matched the UI and DB state when the workflow touches real processes.
- Whether any unexpected navigation, full-page refresh, uncaught console error, or 500 response occurred.

## Standard Stop Conditions

Stop the workflow immediately if:

- The flow would end or mutate a session in a non-test repo.
- The page reports `Unauthorized`, `500`, or `Deployment not found or already ended` in a path that should be active.
- A destructive action would be run without an explicit test target.
- Playwright detects unexpected navigation during cancel or reconnect.
- tmux/ttyd/DB state diverges from the UI and the workflow does not explicitly cover stale reconciliation.

## Playwright Driver Skeleton

Use this skeleton as the base for local workflow automation:

```js
const { chromium } = require("playwright");

const URL = "http://localhost:3847/workbench";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const events = [];
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) events.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => events.push(`pageerror: ${err.message}`));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) events.push(`navigation: ${frame.url()}`);
  });

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  // Workflow-specific steps go here.

  console.log(JSON.stringify({ events }, null, 2));
  await browser.close();
})();
```

## Completion Rule

This QA suite is complete only when all workflow files have a pass/fail receipt, automated Playwright coverage exists for stale and cancel/reconnect cases, and a final audit maps every workflow to evidence.
