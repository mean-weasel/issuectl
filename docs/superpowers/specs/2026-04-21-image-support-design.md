# Image Support in Issues

Full image support for viewing and authoring GitHub issue content — rendering images in issue bodies and comments, a lightbox for enlarging images, and image upload via GitHub's CDN for both issue creation and commenting.

## Background

GitHub issues frequently contain images — screenshots, recordings, diagrams — embedded as markdown (`![alt](url)`). The issuectl dashboard partially supports this today:

- **Issue bodies** render markdown via `react-markdown` + `remark-gfm` in `BodyText.tsx`, including basic image rendering with responsive CSS
- **Comments** render as plain text (`white-space: pre-wrap`), so image markdown appears as raw syntax
- **No lightbox** — images cannot be clicked to enlarge
- **No image upload** — the issue creation form and comment composer accept only text

## Scope

Four features, listed in implementation order:

1. **Comment markdown rendering** — render comment bodies with `BodyText` instead of plain text
2. **Image lightbox** — click-to-enlarge overlay with left/right navigation across all page images
3. **Image upload** — drag/drop, paste, and attach button for both issue creation and commenting
4. **Comment composer attach bar** — integrate upload UX into the existing comment composer

## Feature 1: Comment Markdown Rendering

### Change

Replace plain text rendering in `CommentList.tsx` with the existing `BodyText` component.

### Current code

```tsx
// CommentList.tsx line 39
<div className={styles.body}>{c.body}</div>
```

### Target

```tsx
<BodyText body={c.body} />
```

### CSS adjustments

Remove the `.body` class from `CommentList.module.css` (lines 84-91) since `BodyText` brings its own styles. Wrap in a `.commentBody` class that reduces font size slightly (14px vs 16px) to visually differentiate comments from the main issue body.

### Result

Images, bold, code blocks, links, tables, task lists — everything `BodyText` already handles — now works in comments.

## Feature 2: Image Lightbox

### Component: `ImageLightbox`

A client component rendered once at the issue detail page level via a React portal to `document.body`.

### Context: `LightboxContext`

A React context providing `{ open(src: string, allImages: string[]), close() }`. Mounted as a provider wrapping the issue detail page content.

### Integration with BodyText

`BodyText` accepts an optional `onImageClick` callback prop. When provided, it passes a custom `img` component renderer to `react-markdown`'s `components` prop. Each rendered `<img>` gets an `onClick` handler that calls `onImageClick(src)`. When `onImageClick` is not provided (e.g., outside the issue detail page), images render normally without click behavior.

The `LightboxProvider` passes the `onImageClick` callback to all `BodyText` instances. When an image is clicked, the provider:

1. Collects all image `src` values from a container ref wrapping the page content
2. Opens the lightbox at the clicked image's index

### Component tree

```
IssueDetailPage
  └── LightboxProvider
        ├── IssueDetail
        │     ├── BodyText (issue body — images clickable)
        │     ├── CommentList
        │     │     ├── BodyText (comment 1 — images clickable)
        │     │     └── BodyText (comment 2 — images clickable)
        │     └── CommentComposer
        └── ImageLightbox (portal to document.body)
```

### Lightbox behavior

| Action | Result |
|---|---|
| Click image inline | Open lightbox at that image's index |
| Left/right arrows (click or keyboard) | Navigate between all images on page |
| Click backdrop | Close |
| Press Escape | Close |
| Click X button | Close |
| Wrap-around | Yes — last image → first, first → last |

### UI

- Dark semi-transparent backdrop (`rgba(0,0,0,0.88)`)
- Centered image scaled to fit viewport with padding
- Close button (X) top-right
- Left/right arrow buttons at vertical center
- Counter ("2 of 5") bottom-center
- CSS transitions for image switching

### Files

- `packages/web/components/detail/ImageLightbox.tsx` — component + context
- `packages/web/components/detail/ImageLightbox.module.css` — styles

## Feature 3: Image Upload

### Upload pipeline

```
User action (drag/drop, paste, attach click)
  → useImageUpload() hook validates file type/size
  → Insert placeholder: ![Uploading image…]()
  → Call uploadImage server action
  → Server action calls uploadImageToGitHub() in core
  → GitHub CDN returns URL (user-images.githubusercontent.com)
  → Replace placeholder: ![image](https://user-images...)
```

### Core function: `uploadImageToGitHub`

Location: `packages/core/src/github/uploads.ts`

Uses GitHub's undocumented but stable upload endpoint (the same one GitHub.com uses for image paste in issues/PRs) to post the image binary and receive a CDN URL. This endpoint has been stable for years and is used by GitHub CLI, GitHub Desktop, and many extensions. Accepts a GitHub auth token, repo owner/name (for upload context), and file data (as `Buffer` or `Uint8Array`). Returns the permanent CDN URL (`https://user-images.githubusercontent.com/...`).

### Server action: `uploadImage`

Location: `packages/web/lib/actions/uploads.ts`

Accepts a `FormData` with the image file, owner, and repo. Calls core's `uploadImageToGitHub` via `withAuthRetry`. Returns `{ success: true, url: string }` or `{ success: false, error: string }`.

### Client hook: `useImageUpload`

Location: `packages/web/hooks/useImageUpload.ts`

Shared between `NewIssuePage` and `CommentComposer`. Accepts a ref to the textarea element and the current body state setter.

Responsibilities:
- **Drag/drop handling** — `onDragOver` (visual feedback), `onDrop` (extract files)
- **Paste handling** — `onPaste` (extract image from clipboard)
- **Attach button** — triggers a hidden `<input type="file">`, accepts image types
- **Validation** — file type (PNG, JPG, GIF, WEBP), file size (max 10 MB)
- **Placeholder management** — insert at cursor position, replace on success/failure
- **Upload state** — `{ uploading: boolean, error: string | null }`

### Upload states

| State | Textarea content | UI |
|---|---|---|
| Uploading | `![Uploading image…]()` at cursor | Spinner near attach button, textarea not disabled (user can keep typing elsewhere) |
| Success | `![image](https://user-images…)` | Placeholder replaced, no other feedback needed |
| Error | `![Upload failed]()` | Toast with error message, user deletes placeholder manually |

### Constraints

- **File types:** PNG, JPG, GIF, WEBP
- **Max size:** 10 MB per image (GitHub's limit)
- **Multiple files:** Sequential upload, one placeholder per file
- **Drag visual:** Dashed border overlay on textarea during `dragover`

## Feature 4: Attach Bar UI

### New issue form (`NewIssuePage.tsx`)

Add a footer bar below the description textarea:

```
┌─────────────────────────────────┐
│ Description (markdown)          │
│ ┌─────────────────────────────┐ │
│ │ textarea content...         │ │
│ ├─────────────────────────────┤ │
│ │ 📎 attach image    drop or  │ │
│ │                  paste imgs │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

The attach button triggers the hidden file input from `useImageUpload`. The hint text ("drop or paste images") is secondary/muted.

### Comment composer (`CommentComposer.tsx`)

Integrate the attach button into the existing footer bar alongside the hint and submit button:

```
┌─────────────────────────────────┐
│ textarea content...             │
├─────────────────────────────────┤
│ 📎 attach   ⌘↩ to send [comment]│
└─────────────────────────────────┘
```

### CSS

Update `NewIssuePage.module.css` and `CommentComposer.module.css` to add the footer bar styles. Match the Paper design system tokens — `--paper-bg-warm` for footer background, `--paper-line-soft` for border, `--paper-ink-faint` for hint text.

## Dependencies

No new npm packages. The implementation uses:

- `react-markdown` (existing) — already in `packages/web`
- `remark-gfm` (existing) — already in `packages/web`
- `@octokit/rest` (existing) — for GitHub API calls
- React portals, context, refs — built-in React

## Files created or modified

### New files

| File | Purpose |
|---|---|
| `packages/core/src/github/uploads.ts` | `uploadImageToGitHub()` — GitHub CDN upload |
| `packages/web/lib/actions/uploads.ts` | `uploadImage` server action |
| `packages/web/hooks/useImageUpload.ts` | Shared upload hook (drag/drop/paste/button) |
| `packages/web/components/detail/ImageLightbox.tsx` | Lightbox component + LightboxContext |
| `packages/web/components/detail/ImageLightbox.module.css` | Lightbox styles |

### Modified files

| File | Change |
|---|---|
| `packages/web/components/detail/CommentList.tsx` | Replace plain text with `BodyText` |
| `packages/web/components/detail/CommentList.module.css` | Remove `.body` styles, add wrapper class |
| `packages/web/components/detail/BodyText.tsx` | Add custom `img` renderer for lightbox click |
| `packages/web/app/issues/[owner]/[repo]/[number]/page.tsx` | Wrap with `LightboxProvider`, mount `ImageLightbox` |
| `packages/web/components/detail/CommentComposer.tsx` | Add attach button, wire `useImageUpload` |
| `packages/web/components/detail/CommentComposer.module.css` | Footer bar styles |
| `packages/web/app/new/NewIssuePage.tsx` | Add attach footer bar, wire `useImageUpload` |
| `packages/web/app/new/NewIssuePage.module.css` | Footer bar styles |
| `packages/core/src/index.ts` | Export `uploadImageToGitHub` |

## Out of scope

- **Image proxy/optimization** — images load directly from GitHub CDN. Next.js `Image` component is not used for user-content images (would require `remotePatterns` config and adds complexity for uncertain benefit).
- **Markdown preview panel** — no live preview tab for the editors. Users see markdown rendered after submission.
- **Pinch-to-zoom in lightbox** — lightbox shows images at viewport-fit scale, no zoom/pan.
- **Drag-to-reorder images** — images are positioned by their location in the markdown text.
- **Video embeds** — only static images (PNG, JPG, GIF, WEBP). GitHub-hosted videos remain as links.
