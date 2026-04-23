# Fix Image Upload — Replace Broken GitHub Endpoint

Replace the non-functional `uploads.github.com` endpoint with the GitHub Contents API for image uploads.

## Problem

The `uploadImageToGitHub` function in `packages/core/src/github/uploads.ts` uses GitHub's undocumented `uploads.github.com/repos/{owner}/{repo}/issues/uploads` endpoint. This endpoint is designed for GitHub.com's web frontend and authenticates via browser session cookies, not API tokens. Every upload attempt with a PAT or OAuth token (from `gh auth token`) fails with `422 Bad Size` — a misleading error that occurs before the endpoint even inspects the file, because it rejects the auth mechanism.

This was confirmed via both `curl` and Node.js `fetch` with files of various sizes (69 bytes to 27 KB). The error is consistent regardless of file size, format, or additional form fields.

PR #202 raised the Next.js `bodySizeLimit` to 10 MB, which fixed the Server Action layer but did not address the underlying GitHub endpoint failure. The upload has never worked in production.

## Solution

Replace the upload mechanism with the **GitHub Contents API** (`PUT /repos/{owner}/{repo}/contents/{path}`), which is documented, stable, and works with any GitHub token type.

Additionally, widen the CSP `img-src` directive and `images.remotePatterns` config to allow all GitHub image-hosting domains so that images render correctly in the dashboard.

## Design

### Upload flow (unchanged from caller's perspective)

```
User action (drag/drop, paste, attach click)
  → useImageUpload() hook validates file type/size       [unchanged]
  → Insert placeholder: ![Uploading image…]()            [unchanged]
  → Call uploadImage server action                        [unchanged]
  → Server action calls uploadImageToGitHub() in core     [unchanged]
  → GitHub Contents API creates file in repo              [NEW]
  → Return raw.githubusercontent.com URL                  [NEW]
  → Replace placeholder: ![image](https://raw.git...)    [unchanged]
```

### Core function changes: `uploadImageToGitHub`

**File:** `packages/core/src/github/uploads.ts`

The function signature stays identical:

```ts
export async function uploadImageToGitHub(
  token: string,
  owner: string,
  repo: string,
  file: { name: string; type: string; data: Buffer | Uint8Array },
): Promise<UploadResult>
```

**Internal changes:**

1. **Endpoint:** `PUT https://api.github.com/repos/{owner}/{repo}/contents/{path}` instead of `POST https://uploads.github.com/repos/{owner}/{repo}/issues/uploads`
2. **Request body:** JSON with base64-encoded content instead of multipart form data
3. **Upload path:** `.github/issuectl/uploads/{timestamp}-{random6}-{sanitized_filename}` — the timestamp and random suffix prevent collisions
4. **Commit message:** `chore(issuectl): upload image {filename}`
5. **Response parsing:** Extract `content.download_url` from the Contents API response instead of `href` / `asset.href` from the old endpoint
6. **Filename sanitization:** Strip characters that are invalid in file paths (keep alphanumeric, hyphens, dots, underscores)

**Validation** (type checking, size checking) remains unchanged at the top of the function.

### CSP and image config changes

**File:** `packages/web/next.config.ts`

**`img-src` directive** — add three GitHub image domains:

```
img-src 'self' data: https://avatars.githubusercontent.com https://raw.githubusercontent.com https://user-images.githubusercontent.com https://github.com
```

- `raw.githubusercontent.com` — serves images uploaded via the Contents API (the new upload path)
- `user-images.githubusercontent.com` — serves images uploaded via GitHub.com's web UI (existing comments)
- `github.com` — serves images at `github.com/user-attachments/assets/...` URLs (newer GitHub CDN format)

**`images.remotePatterns`** — add matching entries so any future use of `next/image` with these domains works without additional config changes.

### Test changes

**File:** `packages/core/src/github/uploads.test.ts`

- Mock `fetch` for the Contents API `PUT` instead of the old multipart `POST`
- Verify request URL follows the pattern `https://api.github.com/repos/{owner}/{repo}/contents/.github/issuectl/uploads/{filename}`
- Verify request body contains `message` and base64-encoded `content` fields
- Verify response parsing extracts `content.download_url`
- Verify filename sanitization (strips unsafe characters)
- Keep all existing validation tests (type check, size check) — they test code that doesn't change

**File:** `packages/web/lib/actions/uploads.test.ts` — no changes needed. This file mocks `uploadImageToGitHub` at the module level, so the Server Action tests are unaffected.

## Files changed

| File | Change |
|---|---|
| `packages/core/src/github/uploads.ts` | Replace upload implementation (Contents API) |
| `packages/core/src/github/uploads.test.ts` | Update mocks/assertions for new API |
| `packages/web/next.config.ts` | Widen CSP `img-src`, add `images.remotePatterns` |
| `packages/web/e2e/audit-verification.spec.ts` | Update CSP assertion string if it exists |

## What doesn't change

- `useImageUpload` hook
- `CommentComposer` and `NewIssuePage` components
- Server Action (`packages/web/lib/actions/uploads.ts`)
- `ALLOWED_IMAGE_TYPES`, `MAX_IMAGE_SIZE` constants
- `UploadResult` type
- `bodySizeLimit: "10mb"` in next.config (still needed for the Server Action)
- Function signature of `uploadImageToGitHub`

## Trade-offs

**Commits per upload:** Each image upload creates a commit in the target repo at `.github/issuectl/uploads/`. This is the primary trade-off vs. the old CDN approach. Mitigated by: the path is in a dotfile directory most users never browse, and the commit message clearly identifies it as auto-generated.

**URL permanence:** `raw.githubusercontent.com` URLs are permanent as long as the file exists in the repo. If someone deletes the file or force-pushes over the commit, the image breaks. This is acceptable for a developer tool.

## Out of scope

- Local image caching / serving via Next.js API routes
- Upload to an orphan branch (extra complexity for marginal benefit)
- Migration of existing broken image references
- Image compression or resizing before upload
