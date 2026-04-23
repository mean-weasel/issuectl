# Fix Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the non-functional `uploads.github.com` endpoint with the GitHub Contents API so image uploads work with PAT/OAuth tokens.

**Architecture:** The only production code change is in `packages/core/src/github/uploads.ts` — swap the `fetch` target from the undocumented multipart endpoint to the standard GitHub Contents API (`PUT /repos/{owner}/{repo}/contents/{path}`). The function signature, validation logic, exports, and all callers remain unchanged. CSP and image config in `packages/web/next.config.ts` are widened to allow GitHub image domains.

**Tech Stack:** Node.js `fetch`, GitHub REST API (Contents), base64 encoding, Vitest

**Spec:** `docs/superpowers/specs/2026-04-23-fix-image-upload-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/core/src/github/uploads.ts` | Modify | Replace upload implementation (Contents API), add `sanitizeFilename` helper |
| `packages/core/src/github/uploads.test.ts` | Modify | Update mocks/assertions for Contents API |
| `packages/web/next.config.ts` | Modify | Widen CSP `img-src`, add `images.remotePatterns` entries |
| `packages/web/e2e/audit-verification.spec.ts` | Modify | Update CSP `img-src` assertion string |

No new files. No changes to `packages/core/src/index.ts` (exports stay the same). No changes to `packages/web/lib/actions/uploads.ts` or its tests.

---

### Task 1: Add `sanitizeFilename` helper with tests

**Files:**
- Modify: `packages/core/src/github/uploads.ts`
- Modify: `packages/core/src/github/uploads.test.ts`

- [ ] **Step 1: Write failing tests for `sanitizeFilename`**

Add this `describe` block at the bottom of `packages/core/src/github/uploads.test.ts`, after the existing `MAX_IMAGE_SIZE` describe:

```ts
describe("sanitizeFilename", () => {
  it("passes through simple alphanumeric names", () => {
    expect(sanitizeFilename("photo.png")).toBe("photo.png");
  });

  it("replaces spaces with hyphens", () => {
    expect(sanitizeFilename("my photo.png")).toBe("my-photo.png");
  });

  it("strips characters that are not alphanumeric, hyphens, dots, or underscores", () => {
    expect(sanitizeFilename("image (1).png")).toBe("image-1.png");
  });

  it("handles filenames with unicode characters", () => {
    expect(sanitizeFilename("café_résumé.jpg")).toBe("caf_rsum.jpg");
  });

  it("returns 'image' when all characters are stripped", () => {
    expect(sanitizeFilename("///")).toBe("image");
  });

  it("collapses multiple consecutive hyphens", () => {
    expect(sanitizeFilename("a   b---c.png")).toBe("a-b-c.png");
  });
});
```

Update the import at the top of the test file to include `sanitizeFilename`:

```ts
import { uploadImageToGitHub, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE, sanitizeFilename } from "./uploads.js";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @issuectl/core test -- --run uploads`
Expected: FAIL — `sanitizeFilename` is not exported from `./uploads.js`

- [ ] **Step 3: Implement `sanitizeFilename` and export it**

Add this function to `packages/core/src/github/uploads.ts`, after the `MAX_IMAGE_SIZE` constant (before `uploadImageToGitHub`):

```ts
/**
 * Sanitize a filename for use in a GitHub repo path.
 * Keeps alphanumeric, hyphens, dots, and underscores.
 */
export function sanitizeFilename(name: string): string {
  const sanitized = name
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-{2,}/g, "-");
  return sanitized || "image";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @issuectl/core test -- --run uploads`
Expected: All `sanitizeFilename` tests PASS. Existing tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/github/uploads.ts packages/core/src/github/uploads.test.ts
git commit -m "feat(core): add sanitizeFilename helper for upload paths"
```

---

### Task 2: Replace `uploadImageToGitHub` implementation

**Files:**
- Modify: `packages/core/src/github/uploads.ts`
- Modify: `packages/core/src/github/uploads.test.ts`

- [ ] **Step 1: Rewrite the upload tests for the Contents API**

Replace the test helpers `makeOkResponse` and `makeErrorResponse` and all tests inside `describe("uploadImageToGitHub", ...)` in `packages/core/src/github/uploads.test.ts`. Keep the `beforeEach`/`afterEach` that stubs `fetch`. Keep the `ALLOWED_IMAGE_TYPES` and `MAX_IMAGE_SIZE` describe blocks unchanged. Keep the new `sanitizeFilename` describe block from Task 1.

Replace the helpers with:

```ts
function makeContentsApiOkResponse(downloadUrl: string) {
  return {
    ok: true,
    status: 201,
    statusText: "Created",
    json: vi.fn().mockResolvedValue({
      content: {
        name: "test.png",
        path: ".github/issuectl/uploads/test.png",
        download_url: downloadUrl,
      },
      commit: { sha: "abc123def456" },
    }),
    text: vi.fn().mockResolvedValue(""),
  };
}

function makeErrorResponse(status: number, text = "") {
  return {
    ok: false,
    status,
    statusText: "Error",
    json: vi.fn().mockResolvedValue({}),
    text: vi.fn().mockResolvedValue(text),
  };
}
```

Replace all tests inside `describe("uploadImageToGitHub", ...)` with:

```ts
describe("uploadImageToGitHub", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -----------------------------------------------------------------------
  // 1. Happy path — Contents API
  // -----------------------------------------------------------------------
  it("returns { url, fileName } from Contents API download_url", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(
      makeContentsApiOkResponse("https://raw.githubusercontent.com/test-owner/test-repo/main/.github/issuectl/uploads/test.png") as unknown as Response,
    );

    const result = await uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE);

    expect(result.url).toBe(
      "https://raw.githubusercontent.com/test-owner/test-repo/main/.github/issuectl/uploads/test.png",
    );
    expect(result.fileName).toBe("test.png");
  });

  it("sends a PUT to the Contents API with base64-encoded content", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(
      makeContentsApiOkResponse("https://raw.githubusercontent.com/o/r/main/f.png") as unknown as Response,
    );

    await uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(
      /^https:\/\/api\.github\.com\/repos\/test-owner\/test-repo\/contents\/\.github\/issuectl\/uploads\/\d+-[a-z0-9]+-test\.png$/,
    );
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${TOKEN}`,
    );
    expect((init.headers as Record<string, string>)["Accept"]).toBe(
      "application/vnd.github+json",
    );

    const body = JSON.parse(init.body as string) as { message: string; content: string };
    expect(body.message).toMatch(/^chore\(issuectl\): upload image test\.png$/);
    expect(body.content).toBe(Buffer.from(VALID_FILE.data).toString("base64"));
  });

  // -----------------------------------------------------------------------
  // 2. Invalid file type
  // -----------------------------------------------------------------------
  it("throws with 'Unsupported image type' for image/svg+xml", async () => {
    const svgFile = { ...VALID_FILE, type: "image/svg+xml" };

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, svgFile),
    ).rejects.toThrow("Unsupported image type");

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 3. File too large
  // -----------------------------------------------------------------------
  it("throws with 'Image too large' when data exceeds MAX_IMAGE_SIZE", async () => {
    const bigFile = { ...VALID_FILE, data: Buffer.alloc(MAX_IMAGE_SIZE + 1, 0) };

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, bigFile),
    ).rejects.toThrow("Image too large");

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does NOT throw when data is exactly MAX_IMAGE_SIZE bytes", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      makeContentsApiOkResponse("https://raw.githubusercontent.com/o/r/main/f.png") as unknown as Response,
    );
    const atLimitFile = {
      ...VALID_FILE,
      data: Buffer.alloc(MAX_IMAGE_SIZE, 0),
    };

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, atLimitFile),
    ).resolves.toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 4. HTTP errors
  // -----------------------------------------------------------------------
  it("throws with the HTTP status when response is not ok (403)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      makeErrorResponse(403, "Forbidden") as unknown as Response,
    );

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("403");
  });

  it("throws when response status is 500", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      makeErrorResponse(500, "Internal Server Error") as unknown as Response,
    );

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("GitHub image upload failed");
  });

  // -----------------------------------------------------------------------
  // 5. Missing download_url in response
  // -----------------------------------------------------------------------
  it("throws when response has no content.download_url", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 201,
      statusText: "Created",
      json: vi.fn().mockResolvedValue({ content: {} }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("returned no URL");
  });

  it("throws when response has no content field at all", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 201,
      statusText: "Created",
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("returned no URL");
  });

  // -----------------------------------------------------------------------
  // 6. Malformed JSON response
  // -----------------------------------------------------------------------
  it("throws a descriptive error when response.json() throws", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 201,
      statusText: "Created",
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
      text: vi.fn().mockResolvedValue("<html>not json</html>"),
    } as unknown as Response);

    await expect(
      uploadImageToGitHub(TOKEN, OWNER, REPO, VALID_FILE),
    ).rejects.toThrow("invalid JSON");
  });

  // -----------------------------------------------------------------------
  // 7. Filename sanitization in the request URL
  // -----------------------------------------------------------------------
  it("sanitizes the filename in the upload path", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(
      makeContentsApiOkResponse("https://raw.githubusercontent.com/o/r/main/f.png") as unknown as Response,
    );

    const fileWithSpaces = { ...VALID_FILE, name: "my photo (1).png" };
    await uploadImageToGitHub(TOKEN, OWNER, REPO, fileWithSpaces);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("my-photo-1.png");
    expect(url).not.toContain(" ");
    expect(url).not.toContain("(");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @issuectl/core test -- --run uploads`
Expected: FAIL — tests reference the new response structure but `uploadImageToGitHub` still uses the old endpoint.

- [ ] **Step 3: Replace the `uploadImageToGitHub` implementation**

Replace the entire `uploadImageToGitHub` function body in `packages/core/src/github/uploads.ts`. Keep the function signature, keep the validation at the top. Replace everything from the `const formData = new FormData()` line to the end of the function:

```ts
export async function uploadImageToGitHub(
  token: string,
  owner: string,
  repo: string,
  file: {
    name: string;
    type: string;
    data: Buffer | Uint8Array;
  },
): Promise<UploadResult> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error(
      `Unsupported image type: ${file.type}. Allowed: PNG, JPG, GIF, WEBP.`,
    );
  }

  if (file.data.byteLength > MAX_IMAGE_SIZE) {
    const sizeMB = (file.data.byteLength / 1024 / 1024).toFixed(1);
    throw new Error(
      `Image too large: ${sizeMB} MB. Maximum is 10 MB.`,
    );
  }

  const sanitized = sanitizeFilename(file.name);
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const path = `.github/issuectl/uploads/${timestamp}-${random}-${sanitized}`;
  const content = Buffer.from(file.data).toString("base64");

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `chore(issuectl): upload image ${sanitized}`,
        content,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `GitHub image upload failed (${response.status}): ${text || response.statusText}`,
    );
  }

  let result: { content?: { download_url?: string } };
  try {
    result = (await response.json()) as typeof result;
  } catch {
    const text = await response.text().catch(() => "");
    throw new Error(
      `GitHub returned invalid JSON after upload (status ${response.status}). Body: ${text.slice(0, 200)}`,
    );
  }

  const url = result.content?.download_url;
  if (!url) {
    throw new Error(
      "GitHub image upload succeeded but returned no URL. Response: " +
        JSON.stringify(result).slice(0, 200),
    );
  }

  return { url, fileName: file.name };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/core test -- --run uploads`
Expected: ALL tests PASS (sanitizeFilename + uploadImageToGitHub + ALLOWED_IMAGE_TYPES + MAX_IMAGE_SIZE)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/github/uploads.ts packages/core/src/github/uploads.test.ts
git commit -m "fix(core): replace broken uploads.github.com with Contents API

The undocumented uploads.github.com endpoint rejects PAT/OAuth
tokens with 422 Bad Size. Switch to the standard GitHub Contents
API which works with any token type."
```

---

### Task 3: Widen CSP and image config

**Files:**
- Modify: `packages/web/next.config.ts:79-82,121,139`
- Modify: `packages/web/e2e/audit-verification.spec.ts:185`

- [ ] **Step 1: Update `images.remotePatterns` in `next.config.ts`**

In `packages/web/next.config.ts`, find the `images` block (around line 79):

```ts
  images: {
    remotePatterns: [
      { hostname: "avatars.githubusercontent.com" },
    ],
  },
```

Replace with:

```ts
  images: {
    remotePatterns: [
      { hostname: "avatars.githubusercontent.com" },
      { hostname: "raw.githubusercontent.com" },
      { hostname: "user-images.githubusercontent.com" },
      { hostname: "github.com" },
    ],
  },
```

- [ ] **Step 2: Update the main CSP `img-src` directive**

In `packages/web/next.config.ts`, find the main `img-src` line (around line 121):

```ts
      "img-src 'self' data: https://avatars.githubusercontent.com",
```

Replace with:

```ts
      "img-src 'self' data: https://avatars.githubusercontent.com https://raw.githubusercontent.com https://user-images.githubusercontent.com https://github.com",
```

- [ ] **Step 3: Update the terminal CSP `img-src` directive**

In `packages/web/next.config.ts`, find the terminal `img-src` line (around line 139):

```ts
      "img-src 'self' data:",
```

No change needed — terminal proxy routes don't render user-uploaded images.

- [ ] **Step 4: Update the e2e CSP assertion**

In `packages/web/e2e/audit-verification.spec.ts`, find the `REQUIRED_DIRECTIVES` array (around line 185):

```ts
    "img-src 'self' data: https://avatars.githubusercontent.com",
```

Replace with:

```ts
    "img-src 'self' data: https://avatars.githubusercontent.com https://raw.githubusercontent.com https://user-images.githubusercontent.com https://github.com",
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS with no type errors

- [ ] **Step 6: Commit**

```bash
git add packages/web/next.config.ts packages/web/e2e/audit-verification.spec.ts
git commit -m "fix(web): widen CSP img-src for GitHub image domains

Add raw.githubusercontent.com (Contents API uploads),
user-images.githubusercontent.com (GitHub web UI uploads),
and github.com (newer CDN format) to both CSP img-src and
images.remotePatterns."
```

---

### Task 4: Verify build and run server action tests

**Files:** None modified — verification only.

- [ ] **Step 1: Run server action tests (should pass without changes)**

Run: `pnpm --filter @issuectl/web test -- --run uploads`
Expected: PASS — these tests mock `uploadImageToGitHub` at the module level, so the implementation change doesn't affect them.

- [ ] **Step 2: Run full build**

Run: `pnpm turbo build`
Expected: PASS — all packages build successfully.

- [ ] **Step 3: Run all tests**

Run: `pnpm turbo test`
Expected: All core and web unit tests PASS.

- [ ] **Step 4: Manual verification (optional)**

To verify the upload works end-to-end against a real GitHub repo:

1. Start the dev server: `pnpm turbo dev`
2. Open the dashboard in a browser
3. Navigate to an issue detail page
4. Click the "attach" button in the comment composer
5. Select a PNG or JPEG image
6. Verify the placeholder text appears, then is replaced with `![filename](https://raw.githubusercontent.com/...)`
7. Post the comment and verify the image renders in the dashboard
8. Check the target repo on GitHub — a commit should exist at `.github/issuectl/uploads/{filename}` with the image

---

## Summary of Changes

| Change | Why |
|---|---|
| `sanitizeFilename` helper | Generate safe file paths for the Contents API |
| Replace `fetch` to `uploads.github.com` with `PUT` to `api.github.com/repos/.../contents/...` | The old endpoint rejects PAT/OAuth tokens |
| Base64-encode file instead of multipart form | Contents API requires JSON body with base64 content |
| Parse `content.download_url` instead of `href`/`asset.href` | Different response shape from Contents API |
| Widen CSP `img-src` | Allow GitHub image domains in the dashboard |
| Add `images.remotePatterns` entries | Allow `next/image` with GitHub image domains |
