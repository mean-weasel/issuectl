# Version Display: Splash Screen + Persistent Badge

**Date:** 2026-04-21
**Status:** Approved

## Problem

The app version is buried in two low-visibility spots (Settings page footer and FiltersSheet bottom). When iterating quickly, there's no easy way to:
1. **Glance at the current version** without navigating away from the current page.
2. **Confirm a deploy landed** — after pushing a new version, there's no immediate visual signal that the app updated.

## Solution

Two complementary pieces:

1. **Splash screen** — a full-screen overlay on cold load showing the logo and version, fading out after ~1.5s.
2. **Persistent version badge** — a small monospace pill next to the brand mark in the top bar, visible on every page.

## Design Decisions

### Splash Screen

- **Trigger:** Every full page load (browser fetches HTML). Does not re-trigger on client-side navigations. When the service worker serves a cached shell, there is no full reload, so no splash — meaning the splash fires exactly when a new version has landed.
- **Duration:** ~1.5s fade-out via CSS `animation`. No JS timers.
- **Implementation:** A `SplashOverlay` Server Component rendered in `layout.tsx` above `{children}`. Pure HTML + CSS animation. No client JS, no `useState`, no `useEffect`.
- **Animation:** `opacity: 1 → 0` keyframe with `animation-fill-mode: forwards`. The overlay gets `pointer-events: none` at `opacity: 0` so it doesn't block interaction after fading.
- **Visual:** Reuses existing branding from `WelcomeScreen` — the `i` logo mark (56px green rounded square), "issuectl" in Fraunces serif, version string in monospace below. Centered vertically and horizontally on `--paper-bg` background.
- **WelcomeScreen coexistence:** The splash always renders regardless of auth/DB state. It fades in 1.5s and the welcome screen has its own visual hierarchy underneath. The brief overlap is harmless and avoids conditional logic.

### Persistent Version Badge

- **Location:** Next to the brand mark in the top bar. Appears in two components:
  - `List.tsx` — next to the `issuectl` / `ic` brand in `.topBar`
  - `PageHeader.tsx` — next to the page title on detail/settings/new-issue pages
- **Visual treatment:**
  - Font: `--paper-mono`, `--paper-fs-xs` (11px)
  - Color: `--paper-ink-muted`
  - Background: `--paper-accent-soft` pill with `--paper-radius-sm`
  - Matches existing chip/badge visual language
- **Mobile:** Badge shows alongside the compact `ic` brand. Small enough to fit without crowding.
- **Version source:** `process.env.NEXT_PUBLIC_APP_VERSION` — already resolved at build time in `next.config.ts`. No new plumbing.

### Cleanup

The following existing version displays become redundant and are removed:
- `packages/web/app/settings/page.tsx` — `versionFooter` div
- `packages/web/app/settings/page.module.css` — `.versionFooter` styles
- `packages/web/components/list/FiltersSheet.tsx` — version string at the bottom of the sheet

## File Changes

### New files
| File | Purpose |
|------|---------|
| `packages/web/components/ui/SplashOverlay.tsx` | Full-screen fade-out overlay, Server Component |
| `packages/web/components/ui/SplashOverlay.module.css` | Splash animation and layout styles |

### Modified files
| File | Change |
|------|--------|
| `packages/web/app/layout.tsx` | Render `<SplashOverlay />` inside `<body>`, above `{children}` |
| `packages/web/components/list/List.tsx` | Add version badge next to brand mark in `.topBar` |
| `packages/web/components/ui/PageHeader.tsx` | Add version badge next to title |
| `packages/web/app/settings/page.tsx` | Remove `versionFooter` div |
| `packages/web/app/settings/page.module.css` | Remove `.versionFooter` styles |
| `packages/web/components/list/FiltersSheet.tsx` | Remove version string |

### Not touched
- `next.config.ts` — version resolution already works
- No new dependencies, env vars, or data layer changes

## Edge Cases

- **Service worker / PWA:** Splash only fires on full page loads. When SW serves cached shell, no reload occurs, so no splash. This is correct behavior — the splash signals "fresh HTML from server."
- **Fast loads:** If the dashboard renders before the 1.5s animation completes, the splash fades over the ready content. The overlay has `pointer-events: none` once faded, so early interaction is not blocked.
- **No version available:** Falls back to `"dev"` via existing `process.env.NEXT_PUBLIC_APP_VERSION || "dev"` pattern.
