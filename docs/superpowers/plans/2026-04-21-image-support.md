# Image Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full image support to the issuectl dashboard — markdown rendering in comments, click-to-enlarge lightbox with navigation, image upload via GitHub CDN (drag/drop, paste, attach button), and image attach UI in both issue creation and comment composer.

**Architecture:** Four features built sequentially, each self-contained. Feature 1 (comment markdown) reuses the existing `BodyText` component. Feature 2 (lightbox) adds a React context + portal component. Feature 3 (upload) adds a core GitHub upload function, server action, and shared client hook. Feature 4 (attach UI) wires the upload hook into both textareas.

**Tech Stack:** React 19, Next.js App Router, react-markdown + remark-gfm (existing), CSS Modules, GitHub REST API (image upload endpoint), Server Actions.

**Spec:** `docs/superpowers/specs/2026-04-21-image-support-design.md`

---

### Task 1: Render Markdown in Comments

**Files:**
- Modify: `packages/web/components/detail/CommentList.tsx`
- Modify: `packages/web/components/detail/CommentList.module.css`

- [ ] **Step 1: Replace plain text with BodyText in CommentList.tsx**

Add the `BodyText` import and replace the plain text `<div>` with the `BodyText` component. Wrap it in a `<div>` with a `commentBody` class for font size control.

In `packages/web/components/detail/CommentList.tsx`:

Add the import at the top:

```tsx
import { BodyText } from "./BodyText";
```

Replace this line (line 39):

```tsx
<div className={styles.body}>{c.body}</div>
```

With:

```tsx
<div className={styles.commentBody}>
  <BodyText body={c.body} />
</div>
```

- [ ] **Step 2: Update CommentList.module.css**

Remove the `.body` class (lines 84-91) and replace it with a `.commentBody` wrapper that reduces font size to 14px to visually differentiate comments from the main issue body.

Remove this block from `packages/web/components/detail/CommentList.module.css`:

```css
.body {
  font-family: var(--paper-serif);
  font-size: 14px;
  line-height: 1.55;
  color: var(--paper-ink-soft);
  white-space: pre-wrap;
  word-wrap: break-word;
}
```

Add this block in its place:

```css
.commentBody {
  font-size: var(--paper-fs-md);
}
```

This wrapper overrides `BodyText`'s default 16px font size. All other markdown styles (headings, code blocks, links, images) inherit from `BodyText.module.css`.

- [ ] **Step 3: Typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass with no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/detail/CommentList.tsx packages/web/components/detail/CommentList.module.css
git commit -m "feat: render markdown in comments via BodyText component"
```

---

### Task 2: Image Lightbox — Component and Context

**Files:**
- Create: `packages/web/components/detail/ImageLightbox.tsx`
- Create: `packages/web/components/detail/ImageLightbox.module.css`

- [ ] **Step 1: Create ImageLightbox.tsx**

This file exports two things: `LightboxProvider` (context provider) and `ImageLightbox` (the overlay component rendered via portal).

Write `packages/web/components/detail/ImageLightbox.tsx`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import styles from "./ImageLightbox.module.css";

type LightboxState = {
  images: string[];
  index: number;
} | null;

type LightboxContextValue = {
  open: (src: string, allImages: string[]) => void;
};

const LightboxContext = createContext<LightboxContextValue | null>(null);

export function useLightbox(): LightboxContextValue | null {
  return useContext(LightboxContext);
}

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LightboxState>(null);

  const open = useCallback((src: string, allImages: string[]) => {
    const index = allImages.indexOf(src);
    setState({ images: allImages, index: index >= 0 ? index : 0 });
  }, []);

  const close = useCallback(() => setState(null), []);

  const prev = useCallback(() => {
    setState((s) => {
      if (!s) return s;
      return { ...s, index: s.index === 0 ? s.images.length - 1 : s.index - 1 };
    });
  }, []);

  const next = useCallback(() => {
    setState((s) => {
      if (!s) return s;
      return { ...s, index: (s.index + 1) % s.images.length };
    });
  }, []);

  return (
    <LightboxContext.Provider value={{ open }}>
      {children}
      {state && (
        <ImageLightbox
          images={state.images}
          index={state.index}
          onClose={close}
          onPrev={prev}
          onNext={next}
        />
      )}
    </LightboxContext.Provider>
  );
}

type LightboxProps = {
  images: string[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

function ImageLightbox({ images, index, onClose, onPrev, onNext }: LightboxProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose, onPrev, onNext]);

  const src = images[index];
  const total = images.length;

  return createPortal(
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="Image viewer">
      <button className={styles.close} onClick={onClose} aria-label="Close">
        &times;
      </button>

      {total > 1 && (
        <button
          className={styles.navPrev}
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          aria-label="Previous image"
        >
          &lsaquo;
        </button>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.image}
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
      />

      {total > 1 && (
        <button
          className={styles.navNext}
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          aria-label="Next image"
        >
          &rsaquo;
        </button>
      )}

      {total > 1 && (
        <div className={styles.counter}>
          {index + 1} of {total}
        </div>
      )}
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Create ImageLightbox.module.css**

Write `packages/web/components/detail/ImageLightbox.module.css`:

```css
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  cursor: pointer;
}

.close {
  position: absolute;
  top: 12px;
  right: 16px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 32px;
  line-height: 1;
  cursor: pointer;
  padding: 8px;
  z-index: 1;
}

.close:hover {
  color: white;
}

.image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--paper-radius-md);
  cursor: default;
}

.navPrev,
.navNext {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 48px;
  line-height: 1;
  cursor: pointer;
  padding: 16px;
  z-index: 1;
}

.navPrev:hover,
.navNext:hover {
  color: rgba(255, 255, 255, 0.9);
}

.navPrev {
  left: 8px;
}

.navNext {
  right: 8px;
}

.counter {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.5);
  font-family: var(--paper-mono);
  font-size: var(--paper-fs-sm);
}

@media (max-width: 767px) {
  .backdrop {
    padding: 20px;
  }

  .navPrev,
  .navNext {
    font-size: 36px;
    padding: 12px;
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/detail/ImageLightbox.tsx packages/web/components/detail/ImageLightbox.module.css
git commit -m "feat: add ImageLightbox component with navigation and keyboard support"
```

---

### Task 3: Wire Lightbox into BodyText and Issue Detail Page

**Files:**
- Modify: `packages/web/components/detail/BodyText.tsx`
- Create: `packages/web/components/detail/LightboxBodyText.tsx`
- Modify: `packages/web/app/issues/[owner]/[repo]/[number]/page.tsx`
- Modify: `packages/web/components/detail/IssueDetail.tsx`
- Modify: `packages/web/components/detail/CommentList.tsx`

- [ ] **Step 1: Add onImageClick prop to BodyText**

Modify `packages/web/components/detail/BodyText.tsx` to accept an optional `onImageClick` callback. When provided, render a custom `img` component that wraps each image with a click handler.

Replace the entire file with:

```tsx
"use client";

import { useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import styles from "./BodyText.module.css";

const REMARK_PLUGINS = [remarkGfm];

type Props = {
  body: string | null | undefined;
  onImageClick?: (src: string) => void;
};

export function BodyText({ body, onImageClick }: Props) {
  const handleClick = useCallback(
    (src: string) => {
      onImageClick?.(src);
    },
    [onImageClick],
  );

  const components: Components | undefined = useMemo(() => {
    if (!onImageClick) return undefined;
    return {
      img: ({ src, alt, ...rest }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          {...rest}
          src={src}
          alt={alt ?? ""}
          onClick={() => src && handleClick(src)}
          style={{ cursor: "pointer" }}
        />
      ),
    };
  }, [onImageClick, handleClick]);

  if (!body || body.trim().length === 0) {
    return (
      <div className={styles.empty}>
        <em>no description</em>
      </div>
    );
  }
  return (
    <div className={styles.body}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 2: Add LightboxProvider to the issue detail page**

Modify `packages/web/app/issues/[owner]/[repo]/[number]/page.tsx`. Import `LightboxProvider` and wrap the page content.

Add import at the top:

```tsx
import { LightboxProvider } from "@/components/detail/ImageLightbox";
```

Wrap the return value (lines 80-101). Replace:

```tsx
return (
  <PullToRefreshWrapper action={boundRefresh}>
    <IssueDetail
      ...
    >
      <Suspense fallback={<ContentSkeleton />}>
        <IssueDetailContent ... />
      </Suspense>
    </IssueDetail>
  </PullToRefreshWrapper>
);
```

With:

```tsx
return (
  <LightboxProvider>
    <PullToRefreshWrapper action={boundRefresh}>
      <IssueDetail
        owner={owner}
        repoName={repo}
        repoId={repoId}
        currentPriority={currentPriority}
        issue={issue}
        repoLocalPath={repoRecord?.localPath ?? null}
        deployments={deployments}
        referencedFiles={referencedFiles}
      >
        <Suspense fallback={<ContentSkeleton />}>
          <IssueDetailContent
            owner={owner}
            repoName={repo}
            issue={issue}
            deployments={deployments}
          />
        </Suspense>
      </IssueDetail>
    </PullToRefreshWrapper>
  </LightboxProvider>
);
```

- [ ] **Step 3: Wire onImageClick into IssueDetail**

The `IssueDetail` component is a Server Component that renders `BodyText` for the issue body. Since `useLightbox` is a client hook, we need a thin client wrapper that connects the lightbox context to image clicks.

Create a helper: modify `packages/web/components/detail/IssueDetail.tsx`.

Remove the old import (line 12):

```tsx
import { BodyText } from "./BodyText";
```

Add the new import in its place:

```tsx
import { LightboxBodyText } from "./LightboxBodyText";
```

Replace line 95:

```tsx
<BodyText body={issue.body} />
```

With:

```tsx
<LightboxBodyText body={issue.body} />
```

Then create `packages/web/components/detail/LightboxBodyText.tsx`:

```tsx
"use client";

import { useCallback, useRef } from "react";
import { BodyText } from "./BodyText";
import { useLightbox } from "./ImageLightbox";

type Props = {
  body: string | null | undefined;
};

export function LightboxBodyText({ body }: Props) {
  const lightbox = useLightbox();
  const containerRef = useRef<HTMLDivElement>(null);

  const handleImageClick = useCallback(
    (src: string) => {
      if (!lightbox || !containerRef.current) return;
      const page = containerRef.current.closest("[data-lightbox-root]");
      const root = page ?? document;
      const imgs = Array.from(root.querySelectorAll("img"))
        .map((el) => el.src)
        .filter((s) => s && !s.includes("avatarUrl") && !s.includes("githubusercontent.com/u/"));
      lightbox.open(src, imgs.length > 0 ? imgs : [src]);
    },
    [lightbox],
  );

  return (
    <div ref={containerRef}>
      <BodyText body={body} onImageClick={handleImageClick} />
    </div>
  );
}
```

- [ ] **Step 4: Add data-lightbox-root to the page container**

In `packages/web/components/detail/IssueDetail.tsx`, add the `data-lightbox-root` attribute to the outer container div (line 48). Change:

```tsx
<div className={styles.container}>
```

To:

```tsx
<div className={styles.container} data-lightbox-root>
```

- [ ] **Step 5: Use LightboxBodyText in CommentList too**

Modify `packages/web/components/detail/CommentList.tsx`. Since we just switched to `BodyText` in Task 1, now switch to `LightboxBodyText` so comment images are also clickable.

Replace the import:

```tsx
import { BodyText } from "./BodyText";
```

With:

```tsx
import { LightboxBodyText } from "./LightboxBodyText";
```

And replace the usage:

```tsx
<div className={styles.commentBody}>
  <BodyText body={c.body} />
</div>
```

With:

```tsx
<div className={styles.commentBody}>
  <LightboxBodyText body={c.body} />
</div>
```

- [ ] **Step 6: Typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 7: Commit**

```bash
git add packages/web/components/detail/BodyText.tsx \
  packages/web/components/detail/LightboxBodyText.tsx \
  packages/web/components/detail/IssueDetail.tsx \
  packages/web/components/detail/CommentList.tsx \
  packages/web/app/issues/\[owner\]/\[repo\]/\[number\]/page.tsx
git commit -m "feat: wire lightbox into BodyText for issue body and comments"
```

---

### Task 4: GitHub Image Upload — Core Function

**Files:**
- Create: `packages/core/src/github/uploads.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create uploads.ts in core**

This function uploads an image to GitHub's CDN via the upload endpoint that GitHub.com itself uses. The endpoint is `https://uploads.github.com/repos/{owner}/{repo}/issues/uploads` — it accepts multipart form data and returns a JSON response containing the CDN URL.

Write `packages/core/src/github/uploads.ts`:

```ts
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export type UploadResult = {
  url: string;
  fileName: string;
};

/**
 * Upload an image to GitHub's CDN via the issue-uploads endpoint.
 *
 * This uses the same undocumented (but stable) endpoint that GitHub.com uses
 * when you paste or drag an image into an issue textarea. The endpoint has
 * been stable for years and is relied on by GitHub CLI, GitHub Desktop, and
 * many extensions.
 */
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
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(
      `Unsupported image type: ${file.type}. Allowed: PNG, JPG, GIF, WEBP.`,
    );
  }

  if (file.data.byteLength > MAX_SIZE) {
    const sizeMB = (file.data.byteLength / 1024 / 1024).toFixed(1);
    throw new Error(
      `Image too large: ${sizeMB} MB. Maximum is 10 MB.`,
    );
  }

  // GitHub's upload endpoint expects multipart/form-data with the file
  // in a field named "file". It also needs a "repository_id" but we can
  // use the repo context from the URL instead.
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([file.data], { type: file.type }),
    file.name,
  );

  // The authenticity token isn't needed when using a Bearer token.
  // Content-Type is set automatically by fetch for FormData.
  const response = await fetch(
    `https://uploads.github.com/repos/${owner}/${repo}/issues/uploads`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: formData,
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `GitHub image upload failed (${response.status}): ${text || response.statusText}`,
    );
  }

  const result = (await response.json()) as {
    href?: string;
    asset?: { href?: string; name?: string };
  };

  // The response format can vary — handle both known shapes
  const url = result.href ?? result.asset?.href;
  if (!url) {
    throw new Error(
      "GitHub image upload succeeded but returned no URL. Response: " +
        JSON.stringify(result).slice(0, 200),
    );
  }

  return { url, fileName: file.name };
}
```

- [ ] **Step 2: Export from core index.ts**

Add this line to `packages/core/src/index.ts` after the existing GitHub exports (after line 101):

```ts
export { uploadImageToGitHub } from "./github/uploads.js";
export type { UploadResult } from "./github/uploads.js";
```

- [ ] **Step 3: Build core to verify**

Run: `pnpm --filter @issuectl/core build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/github/uploads.ts packages/core/src/index.ts
git commit -m "feat: add uploadImageToGitHub core function for GitHub CDN uploads"
```

---

### Task 5: Image Upload — Server Action

**Files:**
- Create: `packages/web/lib/actions/uploads.ts`

- [ ] **Step 1: Create the uploadImage server action**

This action accepts FormData (since Server Actions are the only way to send binary data from client to server in App Router), extracts the file, and calls the core upload function.

Write `packages/web/lib/actions/uploads.ts`:

```ts
"use server";

import {
  uploadImageToGitHub,
  getGhToken,
  formatErrorForUser,
} from "@issuectl/core";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function uploadImage(
  formData: FormData,
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  const file = formData.get("file");
  const owner = formData.get("owner");
  const repo = formData.get("repo");

  if (!(file instanceof File)) {
    return { success: false, error: "No file provided" };
  }
  if (typeof owner !== "string" || typeof repo !== "string" || !owner || !repo) {
    return { success: false, error: "Missing repository context" };
  }
  if (file.size > MAX_SIZE) {
    return { success: false, error: "Image must be 10 MB or smaller" };
  }

  try {
    const token = await getGhToken();
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadImageToGitHub(token, owner, repo, {
      name: file.name,
      type: file.type,
      data: buffer,
    });
    return { success: true, url: result.url };
  } catch (err) {
    console.error("[issuectl] Image upload failed:", err);
    return { success: false, error: formatErrorForUser(err) };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 3: Commit**

```bash
git add packages/web/lib/actions/uploads.ts
git commit -m "feat: add uploadImage server action for GitHub CDN uploads"
```

---

### Task 6: Image Upload — Client Hook

**Files:**
- Create: `packages/web/hooks/useImageUpload.ts`

- [ ] **Step 1: Create useImageUpload hook**

This hook handles all three upload input methods (drag/drop, paste, attach button) and manages placeholder insertion/replacement in the textarea.

Write `packages/web/hooks/useImageUpload.ts`:

```ts
"use client";

import { useCallback, useRef, useState } from "react";
import { uploadImage } from "@/lib/actions/uploads";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

type UseImageUploadOptions = {
  /** Current textarea value */
  body: string;
  /** Setter for the textarea value */
  setBody: (value: string | ((prev: string) => string)) => void;
  /** Repo context for upload endpoint */
  owner: string;
  repo: string;
  /** Called on validation or upload error */
  onError?: (message: string) => void;
};

type UseImageUploadReturn = {
  /** Whether an upload is in progress */
  uploading: boolean;
  /** Whether the user is dragging a file over the textarea */
  dragging: boolean;
  /** Ref to the hidden file input */
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  /** Attach to the textarea's onDragOver */
  handleDragOver: (e: React.DragEvent) => void;
  /** Attach to the textarea's onDragLeave */
  handleDragLeave: (e: React.DragEvent) => void;
  /** Attach to the textarea's onDrop */
  handleDrop: (e: React.DragEvent) => void;
  /** Attach to the textarea's onPaste */
  handlePaste: (e: React.ClipboardEvent) => void;
  /** Call from the attach button's onClick */
  openFilePicker: () => void;
  /** Attach to the hidden file input's onChange */
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export function useImageUpload({
  body,
  setBody,
  owner,
  repo,
  onError,
}: UseImageUploadOptions): UseImageUploadReturn {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCountRef = useRef(0);

  const processFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((f) => ALLOWED_TYPES.has(f.type));
      if (imageFiles.length === 0) {
        onError?.("Only PNG, JPG, GIF, and WEBP images are supported.");
        return;
      }

      for (const file of imageFiles) {
        if (file.size > MAX_SIZE) {
          onError?.(`${file.name} is too large (max 10 MB).`);
          continue;
        }

        const placeholder = `![Uploading ${file.name}…]()`;
        setBody((prev) => {
          const needsNewline = prev.length > 0 && !prev.endsWith("\n");
          return prev + (needsNewline ? "\n" : "") + placeholder;
        });

        setUploading(true);
        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("owner", owner);
          formData.append("repo", repo);

          const result = await uploadImage(formData);

          if (result.success) {
            const markdown = `![${file.name}](${result.url})`;
            setBody((prev) => prev.replace(placeholder, markdown));
          } else {
            const failureMark = `![Upload failed: ${file.name}]()`;
            setBody((prev) => prev.replace(placeholder, failureMark));
            onError?.(result.error);
          }
        } catch (err) {
          const failureMark = `![Upload failed: ${file.name}]()`;
          setBody((prev) => prev.replace(placeholder, failureMark));
          onError?.(
            err instanceof Error ? err.message : "Upload failed",
          );
        } finally {
          setUploading(false);
        }
      }
    },
    [owner, repo, setBody, onError],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current++;
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCountRef.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        void processFiles(files);
      }
    },
    [processFiles],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length > 0) {
        e.preventDefault();
        void processFiles(files);
      }
      // If no image files, let the default paste behavior handle text
    },
    [processFiles],
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) {
        void processFiles(files);
      }
      // Reset input so the same file can be selected again
      e.target.value = "";
    },
    [processFiles],
  );

  return {
    uploading,
    dragging,
    fileInputRef,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    openFilePicker,
    handleFileSelect,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 3: Commit**

```bash
git add packages/web/hooks/useImageUpload.ts
git commit -m "feat: add useImageUpload hook for drag/drop, paste, and file picker"
```

---

### Task 7: Attach Bar — Comment Composer

**Files:**
- Modify: `packages/web/components/detail/CommentComposer.tsx`
- Modify: `packages/web/components/detail/CommentComposer.module.css`

- [ ] **Step 1: Wire useImageUpload into CommentComposer**

Modify `packages/web/components/detail/CommentComposer.tsx`:

Add import at the top:

```tsx
import { useImageUpload } from "@/hooks/useImageUpload";
```

Inside the `CommentComposer` function, add the hook call after the existing state declarations (after line 29, the `syncStartRef`):

```tsx
const textareaRef = useRef<HTMLTextAreaElement>(null);

const {
  uploading,
  dragging,
  fileInputRef,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handlePaste,
  openFilePicker,
  handleFileSelect,
} = useImageUpload({
  body,
  setBody,
  owner,
  repo,
  onError: (msg) => showToast(msg, "error"),
});
```

Add `useRef` to the React import at the top (line 1):

```tsx
import { useState, useEffect, useRef } from "react";
```

Note: `useRef` is already imported on the existing line — verify and add if missing.

- [ ] **Step 2: Update the textarea to support drag/drop/paste**

Add event handlers and the drag overlay class to the textarea. Also add a `ref`. Replace the existing `<textarea>` element (lines 99-113) with:

```tsx
<div className={styles.textareaWrap}>
  <textarea
    ref={textareaRef}
    className={`${styles.textarea} ${dragging ? styles.textareaDragging : ""}`}
    value={body}
    onChange={(e) => setBody(e.target.value)}
    onKeyDown={handleKeyDown}
    onDragOver={handleDragOver}
    onDragLeave={handleDragLeave}
    onDrop={handleDrop}
    onPaste={handlePaste}
    placeholder="write a comment…"
    rows={3}
    disabled={sending}
    aria-label="Comment body"
    maxLength={65536}
    autoComplete="off"
    autoCapitalize="sentences"
    spellCheck={true}
    enterKeyHint="send"
  />
</div>
```

- [ ] **Step 3: Add attach button and hidden file input to the footer**

Replace the existing footer (lines 115-126) with:

```tsx
{error && <div className={styles.error}>{error}</div>}
<div className={styles.footer}>
  <button
    type="button"
    className={styles.attachBtn}
    onClick={openFilePicker}
    disabled={sending || uploading}
    aria-label="Attach image"
  >
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3M11 5l-3-3-3 3M8 2v9" />
    </svg>
    {uploading ? "uploading…" : "attach"}
  </button>
  <input
    ref={fileInputRef}
    type="file"
    accept="image/png,image/jpeg,image/gif,image/webp"
    onChange={handleFileSelect}
    className={styles.hiddenInput}
    tabIndex={-1}
  />
  <span className={styles.hint}>⌘↩ to send</span>
  {syncVisible && <SyncDot status="syncing" label="syncing comment" />}
  <Button
    variant="primary"
    size="sm"
    onClick={handleSubmit}
    disabled={sending || uploading || body.trim().length === 0}
  >
    {sending ? "sending…" : "comment"}
  </Button>
</div>
```

Note: The submit button is now also disabled during `uploading` to prevent sending with a placeholder.

- [ ] **Step 4: Add CSS for attach button, drag state, and hidden input**

Add these rules to `packages/web/components/detail/CommentComposer.module.css`:

```css
.textareaWrap {
  position: relative;
}

.textareaDragging {
  border-color: var(--paper-accent);
  border-style: dashed;
  background: var(--paper-accent-soft);
}

.attachBtn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  color: var(--paper-ink-faint);
  font-family: var(--paper-sans);
  font-size: var(--paper-fs-sm);
  cursor: pointer;
  padding: 4px 0;
}

.attachBtn:hover:not(:disabled) {
  color: var(--paper-ink-soft);
}

.attachBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hiddenInput {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 6: Commit**

```bash
git add packages/web/components/detail/CommentComposer.tsx packages/web/components/detail/CommentComposer.module.css
git commit -m "feat: add image attach button to comment composer with drag/drop/paste"
```

---

### Task 8: Attach Bar — New Issue Form

**Files:**
- Modify: `packages/web/app/new/NewIssuePage.tsx`
- Modify: `packages/web/app/new/NewIssuePage.module.css`

- [ ] **Step 1: Wire useImageUpload into NewIssuePage**

Modify `packages/web/app/new/NewIssuePage.tsx`:

Add import at the top:

```tsx
import { useImageUpload } from "@/hooks/useImageUpload";
```

Add `useRef` to the React import if not already present.

Inside the component function, after the existing state declarations (after line 49, the `error` state), add:

```tsx
const textareaRef = useRef<HTMLTextAreaElement>(null);

const repoKey = `${selectedRepo.owner}/${selectedRepo.repo}`;

const {
  uploading,
  dragging,
  fileInputRef,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handlePaste,
  openFilePicker,
  handleFileSelect,
} = useImageUpload({
  body,
  setBody,
  owner: selectedRepo.owner,
  repo: selectedRepo.repo,
  onError: (msg) => showToast(msg, "error"),
});
```

Note: `repoKey` is already declared on line 51 — remove the duplicate. Just add the `textareaRef` and `useImageUpload` call.

- [ ] **Step 2: Update the textarea to support drag/drop/paste**

Replace the existing description field textarea (lines 213-227) with:

```tsx
<div className={styles.textareaWrap}>
  <textarea
    ref={textareaRef}
    id="new-issue-body"
    className={`${styles.textarea} ${dragging ? styles.textareaDragging : ""}`}
    value={body}
    onChange={(e) => setBody(e.target.value)}
    onDragOver={handleDragOver}
    onDragLeave={handleDragLeave}
    onDrop={handleDrop}
    onPaste={handlePaste}
    placeholder="Describe the issue..."
    disabled={isPending}
    maxLength={65536}
    rows={4}
    autoComplete="off"
    autoCapitalize="sentences"
    autoCorrect="on"
    spellCheck
    enterKeyHint="enter"
  />
  <div className={styles.attachFooter}>
    <button
      type="button"
      className={styles.attachBtn}
      onClick={openFilePicker}
      disabled={isPending || uploading}
      aria-label="Attach image"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3M11 5l-3-3-3 3M8 2v9" />
      </svg>
      {uploading ? "uploading…" : "attach image"}
    </button>
    <input
      ref={fileInputRef}
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp"
      onChange={handleFileSelect}
      className={styles.hiddenInput}
      tabIndex={-1}
    />
    <span className={styles.attachHint}>drop or paste images</span>
  </div>
</div>
```

- [ ] **Step 3: Disable Create button during upload**

Update the `canSubmit` check (line 109) to also block during uploads:

```tsx
const canSubmit = title.trim().length > 0 && !isPending && !uploading;
```

- [ ] **Step 4: Add CSS for the attach footer**

Add these rules to `packages/web/app/new/NewIssuePage.module.css`:

```css
.textareaWrap {
  position: relative;
  border: 1px solid var(--paper-line);
  border-radius: var(--paper-radius-md);
  overflow: hidden;
}

.textareaWrap .textarea {
  border: none;
  border-radius: 0;
}

.textareaDragging {
  border-color: var(--paper-accent) !important;
  border-style: dashed !important;
}

.attachFooter {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--paper-line-soft);
  background: var(--paper-bg-warm);
}

.attachBtn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  color: var(--paper-ink-faint);
  font-family: var(--paper-sans);
  font-size: var(--paper-fs-sm);
  cursor: pointer;
  padding: 4px 0;
}

.attachBtn:hover:not(:disabled) {
  color: var(--paper-ink-soft);
}

.attachBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.attachHint {
  margin-left: auto;
  font-family: var(--paper-sans);
  font-size: var(--paper-fs-xs);
  color: var(--paper-ink-faint);
}

.hiddenInput {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm turbo typecheck`
Expected: All packages pass.

- [ ] **Step 6: Commit**

```bash
git add packages/web/app/new/NewIssuePage.tsx packages/web/app/new/NewIssuePage.module.css
git commit -m "feat: add image attach footer to new issue form with drag/drop/paste"
```

---

### Task 9: Visual Verification

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

Run: `pnpm turbo dev`

- [ ] **Step 2: Build all packages**

In a separate terminal:

Run: `pnpm turbo build`
Expected: All packages build successfully.

- [ ] **Step 3: Verify comment markdown rendering**

Open `http://localhost:3847` in a browser. Navigate to an issue that has comments with markdown content (bold, links, code blocks, or images). Verify:
- Comments render markdown (not raw syntax)
- Images in comments display inline
- Code blocks are styled
- Links are clickable
- Font size is slightly smaller than the main issue body

- [ ] **Step 4: Verify lightbox**

Click any image in the issue body or comments. Verify:
- Dark overlay appears
- Image is centered and scaled to fit
- Close button (X) works
- Clicking backdrop closes
- Pressing Escape closes
- If multiple images exist: left/right arrows appear, keyboard arrows work, counter shows "N of M"
- Avatar images in comment headers do NOT trigger the lightbox

- [ ] **Step 5: Verify image upload in new issue form**

Navigate to the new issue form. Verify:
- Attach footer bar appears below the description textarea
- "attach image" button opens a file picker filtered to images
- Dragging an image over the textarea shows a dashed border
- Pasting an image from clipboard inserts a placeholder and uploads
- After upload, placeholder is replaced with the markdown image URL
- Create button is disabled during upload

- [ ] **Step 6: Verify image upload in comment composer**

Navigate to an issue detail page. In the comment composer, verify:
- "attach" button appears in the footer
- Same drag/drop/paste/file-picker behavior as the new issue form
- Comment button is disabled during upload
- Submitting a comment with an uploaded image works — the comment appears with the image rendered

- [ ] **Step 7: Commit any fixes**

If any issues were found and fixed during verification, commit them:

```bash
git add -A
git commit -m "fix: visual verification fixes for image support"
```
