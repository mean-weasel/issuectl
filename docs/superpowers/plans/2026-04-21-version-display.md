# Version Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a splash screen on cold load and a persistent version badge in the top bar so the current app version is always visible.

**Architecture:** A pure-CSS splash overlay (Server Component in `layout.tsx`) fades out after 1.5s on every full page load. A small monospace version pill is added next to the brand in `List.tsx` (main list) and `PageHeader.tsx` (all other pages). Redundant version strings in Settings and FiltersSheet are removed.

**Tech Stack:** Next.js App Router, CSS Modules, CSS keyframe animations, `process.env.NEXT_PUBLIC_APP_VERSION`

**Spec:** `docs/superpowers/specs/2026-04-21-version-display-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/web/components/ui/SplashOverlay.tsx` | Create | Server Component — renders full-screen overlay with logo + version |
| `packages/web/components/ui/SplashOverlay.module.css` | Create | Splash layout, fade-out animation, pointer-events handling |
| `packages/web/app/layout.tsx` | Modify | Render `<SplashOverlay />` above `{children}` |
| `packages/web/components/list/List.tsx` | Modify | Add version badge next to brand mark |
| `packages/web/components/list/List.module.css` | Modify | Add `.versionBadge` styles |
| `packages/web/components/ui/PageHeader.tsx` | Modify | Add version badge next to title |
| `packages/web/components/ui/PageHeader.module.css` | Modify | Add `.versionBadge` styles |
| `packages/web/app/settings/page.tsx` | Modify | Remove `versionFooter` div |
| `packages/web/app/settings/page.module.css` | Modify | Remove `.versionFooter` rule |
| `packages/web/components/list/FiltersSheet.tsx` | Modify | Remove version `<span>` |
| `packages/web/components/list/FiltersSheet.module.css` | Modify | Remove `.version` rule |

---

### Task 1: Create the SplashOverlay component

**Files:**
- Create: `packages/web/components/ui/SplashOverlay.tsx`
- Create: `packages/web/components/ui/SplashOverlay.module.css`

- [ ] **Step 1: Create the CSS module**

```css
/* packages/web/components/ui/SplashOverlay.module.css */

.overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--paper-bg);
  animation: fadeOut 0.5s ease-out 1s forwards;
  pointer-events: auto;
}

.overlay[style] {
  /* After animation completes, pointer-events is set to none
     via animation-fill-mode: forwards on the keyframe */
}

@keyframes fadeOut {
  from {
    opacity: 1;
    pointer-events: auto;
  }
  to {
    opacity: 0;
    pointer-events: none;
  }
}

.logoMark {
  width: 56px;
  height: 56px;
  background: var(--paper-accent);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--paper-mono);
  font-weight: 700;
  font-size: 24px;
  color: var(--paper-bg);
  letter-spacing: -1px;
}

.title {
  font-family: var(--paper-serif);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: var(--paper-ink);
}

.version {
  font-family: var(--paper-mono);
  font-size: var(--paper-fs-sm);
  color: var(--paper-ink-muted);
  letter-spacing: 0.5px;
}
```

- [ ] **Step 2: Create the Server Component**

```tsx
/* packages/web/components/ui/SplashOverlay.tsx */

import styles from "./SplashOverlay.module.css";

export function SplashOverlay() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

  return (
    <div className={styles.overlay} aria-hidden="true">
      <div className={styles.logoMark}>ic</div>
      <div className={styles.title}>issuectl</div>
      <div className={styles.version}>v{version}</div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @issuectl/web typecheck`
Expected: passes (no imports of this component yet, but the file itself must be valid)

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/ui/SplashOverlay.tsx packages/web/components/ui/SplashOverlay.module.css
git commit -m "feat: add SplashOverlay component with fade-out animation"
```

---

### Task 2: Wire SplashOverlay into the root layout

**Files:**
- Modify: `packages/web/app/layout.tsx`

- [ ] **Step 1: Add the import and render the overlay**

In `packages/web/app/layout.tsx`, add the import at the top with the other component imports:

```tsx
import { SplashOverlay } from "@/components/ui/SplashOverlay";
```

Then render `<SplashOverlay />` as the first child inside `<body>`, before the auth conditional:

```tsx
<body>
  <SplashOverlay />
  {auth.authenticated ? (
    <ToastProvider>
      <OfflineIndicator />
      {children}
    </ToastProvider>
  ) : (
    <AuthErrorScreen />
  )}
</body>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @issuectl/web typecheck`
Expected: passes

- [ ] **Step 3: Visual verification**

Run: `pnpm turbo dev`
Open `http://localhost:3847` in a browser. Verify:
- The splash overlay appears centered with the `ic` logo, "issuectl" title, and version string
- It fades out after ~1.5s (1s delay + 0.5s fade)
- The dashboard is visible and interactive after the fade
- Hard-refresh the page — splash plays again
- Navigate to another page (e.g., Settings) via a link — splash does NOT replay

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/layout.tsx
git commit -m "feat: render SplashOverlay in root layout"
```

---

### Task 3: Add persistent version badge to the main list top bar

**Files:**
- Modify: `packages/web/components/list/List.tsx`
- Modify: `packages/web/components/list/List.module.css`

- [ ] **Step 1: Add the CSS for the version badge**

In `packages/web/components/list/List.module.css`, add the `.versionBadge` rule after the `.brand .dot` block (after line 38):

```css
.versionBadge {
  font-family: var(--paper-mono);
  font-style: normal;
  font-size: var(--paper-fs-xs);
  color: var(--paper-ink-muted);
  background: var(--paper-accent-soft);
  padding: 1px 6px;
  border-radius: var(--paper-radius-sm);
  margin-left: 6px;
  vertical-align: 6px;
  letter-spacing: 0.3px;
}
```

- [ ] **Step 2: Add the badge to the JSX**

In `packages/web/components/list/List.tsx`, inside the `<h1 className={styles.brand}>` element (around line 159), add the version badge after the `<span className={styles.dot} />`:

Replace:

```tsx
<h1 className={styles.brand}>
  <span className={styles.brandFull}>issuectl</span>
  <span className={styles.brandCompact}>ic</span>
  <span className={styles.dot} />
</h1>
```

With:

```tsx
<h1 className={styles.brand}>
  <span className={styles.brandFull}>issuectl</span>
  <span className={styles.brandCompact}>ic</span>
  <span className={styles.dot} />
  <span className={styles.versionBadge}>
    v{process.env.NEXT_PUBLIC_APP_VERSION || "dev"}
  </span>
</h1>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @issuectl/web typecheck`
Expected: passes

- [ ] **Step 4: Visual verification**

Open `http://localhost:3847`. Verify:
- On mobile viewport: the version badge appears next to the `ic` brand monogram without crowding the context breadcrumb
- On desktop viewport (≥768px): the version badge appears next to the full `issuectl` brand
- The badge uses muted green pill styling consistent with existing chips

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/list/List.tsx packages/web/components/list/List.module.css
git commit -m "feat: add persistent version badge to list top bar"
```

---

### Task 4: Add persistent version badge to PageHeader

**Files:**
- Modify: `packages/web/components/ui/PageHeader.tsx`
- Modify: `packages/web/components/ui/PageHeader.module.css`

- [ ] **Step 1: Add the CSS for the version badge**

In `packages/web/components/ui/PageHeader.module.css`, add after the `.breadcrumb a:hover` block (after line 59):

```css
.versionBadge {
  font-family: var(--paper-mono);
  font-size: var(--paper-fs-xs);
  color: var(--paper-ink-muted);
  background: var(--paper-accent-soft);
  padding: 1px 6px;
  border-radius: var(--paper-radius-sm);
  margin-left: 8px;
  letter-spacing: 0.3px;
  vertical-align: middle;
}
```

- [ ] **Step 2: Add the badge to the JSX**

In `packages/web/components/ui/PageHeader.tsx`, add the version badge inside `.titleRow` after the `<h1>`:

Replace:

```tsx
<div className={styles.titleRow}>
  <h1 className={styles.title}>{title}</h1>
  {actions && <div className={styles.actions}>{actions}</div>}
</div>
```

With:

```tsx
<div className={styles.titleRow}>
  <h1 className={styles.title}>
    {title}
    <span className={styles.versionBadge}>
      v{process.env.NEXT_PUBLIC_APP_VERSION || "dev"}
    </span>
  </h1>
  {actions && <div className={styles.actions}>{actions}</div>}
</div>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @issuectl/web typecheck`
Expected: passes

- [ ] **Step 4: Visual verification**

Navigate to Settings (`/settings`), New Issue (`/new`), and an issue detail page. Verify:
- The version badge appears next to the page title on each page
- Styling matches the badge in the main list top bar
- Badge doesn't push the title to wrap on mobile

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/ui/PageHeader.tsx packages/web/components/ui/PageHeader.module.css
git commit -m "feat: add persistent version badge to PageHeader"
```

---

### Task 5: Remove redundant version displays

**Files:**
- Modify: `packages/web/app/settings/page.tsx`
- Modify: `packages/web/app/settings/page.module.css`
- Modify: `packages/web/components/list/FiltersSheet.tsx`
- Modify: `packages/web/components/list/FiltersSheet.module.css`

- [ ] **Step 1: Remove the version footer from Settings page**

In `packages/web/app/settings/page.tsx`, remove the `versionFooter` div (lines 76-78):

Remove:

```tsx
        <div className={styles.versionFooter}>
          issuectl v{process.env.NEXT_PUBLIC_APP_VERSION || "dev"}
        </div>
```

- [ ] **Step 2: Remove the `.versionFooter` CSS rule from Settings**

In `packages/web/app/settings/page.module.css`, remove the `.versionFooter` block (lines 33-41):

Remove:

```css
.versionFooter {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--paper-line);
  font-family: var(--paper-mono);
  font-size: var(--paper-fs-xs);
  color: var(--paper-ink-muted);
  text-align: center;
}
```

- [ ] **Step 3: Remove the version string from FiltersSheet**

In `packages/web/components/list/FiltersSheet.tsx`, remove the version `<span>` (lines 278-280):

Remove:

```tsx
        <span className={styles.version}>
          v{process.env.NEXT_PUBLIC_APP_VERSION || "dev"}
        </span>
```

- [ ] **Step 4: Remove the `.version` CSS rule from FiltersSheet**

In `packages/web/components/list/FiltersSheet.module.css`, remove the `.version` block (lines 258-265):

Remove:

```css
.version {
  display: block;
  text-align: center;
  font-family: var(--paper-mono);
  font-size: 11px;
  color: var(--paper-ink-faint);
  padding: 16px 0 4px;
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @issuectl/web typecheck`
Expected: passes

- [ ] **Step 6: Visual verification**

- Open Settings (`/settings`) — no version footer at the bottom of the page
- Open the command sheet on mobile — no version string at the bottom
- Both pages still have the version badge in the top bar / page header from Tasks 3-4

- [ ] **Step 7: Commit**

```bash
git add packages/web/app/settings/page.tsx packages/web/app/settings/page.module.css packages/web/components/list/FiltersSheet.tsx packages/web/components/list/FiltersSheet.module.css
git commit -m "refactor: remove redundant version displays from Settings and FiltersSheet"
```

---

### Task 6: Final integration check

- [ ] **Step 1: Full typecheck**

Run: `pnpm turbo typecheck`
Expected: all packages pass

- [ ] **Step 2: End-to-end walkthrough**

Open `http://localhost:3847` in a fresh browser tab (or hard-refresh). Verify the full flow:

1. Splash screen appears with `ic` logo, "issuectl" title, and version
2. Splash fades out after ~1.5s revealing the dashboard
3. Version badge is visible in the top bar next to the brand
4. Navigate to Settings — version badge appears next to "Settings" title
5. Navigate to an issue detail page — version badge appears next to the issue title
6. Navigate back to the list — no splash replay, badge still visible
7. Hard-refresh — splash replays
8. Open command sheet on mobile — no version string at bottom (removed)
9. Check Settings page — no version footer at bottom (removed)

- [ ] **Step 3: Run existing tests**

Run: `pnpm turbo test`
Expected: all tests pass (no existing tests reference the removed version elements)
