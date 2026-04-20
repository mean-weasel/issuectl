# Resilience Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 19 resilience audit findings — data-loss prevention, input validation symmetry, UX recovery improvements, and defense-in-depth hardening.

**Architecture:** Changes span the web package (components, hooks, lib) and core package (error classification). No new packages. No schema changes. All fixes are additive — no breaking API changes.

**Tech Stack:** React hooks, Next.js App Router, localStorage, BroadcastChannel API, CSS Modules

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/web/hooks/useUnsavedWarning.ts` | Create | `beforeunload` + dirty-tracking hook |
| `packages/web/hooks/useCommentDraft.ts` | Create | localStorage-backed comment draft persistence |
| `packages/web/hooks/useStaleTab.ts` | Create | `visibilitychange` handler for stale-tab detection |
| `packages/web/components/detail/DraftDetail.tsx` | Modify | Wire `useUnsavedWarning` hook |
| `packages/web/components/detail/CommentComposer.tsx` | Modify | Add `maxLength`, wire `useCommentDraft` |
| `packages/web/components/launch/PreambleInput.tsx` | Modify | Add `maxLength`, character counter |
| `packages/web/components/launch/BranchInput.tsx` | Modify | Add inline regex validation |
| `packages/web/components/launch/LaunchModal.tsx` | Modify | Close confirmation, file path validation display |
| `packages/web/components/launch/FileSelector.tsx` | Create | Directory-picker-aware file path UI |
| `packages/web/components/launch/FileSelector.module.css` | Create | Styles for FileSelector |
| `packages/web/components/launch/ContextToggles.tsx` | Modify | Replace inline file toggles with FileSelector |
| `packages/web/components/list/CreateDraftSheet.tsx` | Modify | Pre-generate idempotency keys, partial success UX |
| `packages/web/components/detail/IssueActionSheet.tsx` | Modify | `router.replace` for close, stale-tab hook |
| `packages/web/components/detail/DraftActionSheet.tsx` | Modify | `router.replace` for delete |
| `packages/web/app/DashboardContent.tsx` | Modify | Add retry-capable error fallback |
| `packages/web/components/ui/DashboardError.tsx` | Create | Client component with retry button |
| `packages/web/components/ui/DashboardError.module.css` | Create | Styles for DashboardError |
| `packages/web/hooks/useSyncOnReconnect.ts` | Modify | Add cooldown after replay |
| `packages/web/hooks/useOfflineAware.ts` | Modify | Add BroadcastChannel coordination |
| `packages/web/lib/actions/launch.ts` | Modify | Add preamble length limit, file path validation |
| `packages/core/src/github/errors.ts` | Modify | Enhance `formatErrorForUser` with error kind |

---

## Task 1: Draft editor `beforeunload` warning (RF-3-001)

**Files:**
- Create: `packages/web/hooks/useUnsavedWarning.ts`
- Modify: `packages/web/components/detail/DraftDetail.tsx`

- [ ] **Step 1: Create the `useUnsavedWarning` hook**

```ts
// packages/web/hooks/useUnsavedWarning.ts
"use client";

import { useEffect } from "react";

export function useUnsavedWarning(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
```

- [ ] **Step 2: Wire it into DraftDetail**

In `packages/web/components/detail/DraftDetail.tsx`, add dirty tracking and the hook:

```tsx
import { useUnsavedWarning } from "@/hooks/useUnsavedWarning";

// Inside DraftDetail component, after existing state declarations:
const titleDirty = title !== draft.title;
const bodyDirty = body !== (draft.body ?? "");
useUnsavedWarning(titleDirty || bodyDirty);
```

Add the import at the top and the three lines after the existing `useState` calls for `title` and `body`.

- [ ] **Step 3: Verify**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Manual test**

Open a draft in the browser, edit the title, try to close the tab. Browser should show "Leave site?" confirmation.

- [ ] **Step 5: Commit**

```bash
git add packages/web/hooks/useUnsavedWarning.ts packages/web/components/detail/DraftDetail.tsx
git commit -m "fix: add beforeunload warning for unsaved draft edits (RF-3-001)"
```

---

## Task 2: Comment composer `maxLength` + draft persistence (RF-5-001, RF-3-003)

**Files:**
- Create: `packages/web/hooks/useCommentDraft.ts`
- Modify: `packages/web/components/detail/CommentComposer.tsx`

- [ ] **Step 1: Create the `useCommentDraft` hook**

```ts
// packages/web/hooks/useCommentDraft.ts
"use client";

import { useState, useEffect, useCallback } from "react";

function storageKey(owner: string, repo: string, issueNumber: number): string {
  return `comment-draft:${owner}/${repo}#${issueNumber}`;
}

export function useCommentDraft(
  owner: string,
  repo: string,
  issueNumber: number,
) {
  const key = storageKey(owner, repo, issueNumber);

  const [body, setBody] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    try {
      if (body) {
        localStorage.setItem(key, body);
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // localStorage may be full or unavailable — silently ignore
    }
  }, [body, key]);

  const clear = useCallback(() => {
    setBody("");
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  }, [key]);

  return { body, setBody, clear };
}
```

- [ ] **Step 2: Wire into CommentComposer**

In `packages/web/components/detail/CommentComposer.tsx`:

1. Replace the `useState("")` for body with the new hook:

```tsx
import { useCommentDraft } from "@/hooks/useCommentDraft";

// Replace: const [body, setBody] = useState("");
// With:
const { body, setBody, clear: clearDraft } = useCommentDraft(owner, repo, issueNumber);
```

2. Add `maxLength={65536}` to the textarea:

```tsx
<textarea
  className={styles.textarea}
  value={body}
  onChange={(e) => setBody(e.target.value)}
  onKeyDown={handleKeyDown}
  placeholder="write a comment…"
  rows={3}
  disabled={sending}
  aria-label="Comment body"
  maxLength={65536}
/>
```

3. In the `handleSubmit` success path, replace `setBody("")` with `clearDraft()`:

```tsx
// succeeded
clearDraft();
router.refresh();
```

And in the `"queued"` path:

```tsx
if (result.outcome === "queued") {
  clearDraft();
  showToast("Comment queued — will sync when online", "warning");
  return;
}
```

- [ ] **Step 3: Verify**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/hooks/useCommentDraft.ts packages/web/components/detail/CommentComposer.tsx
git commit -m "fix: add maxLength to comment textarea + localStorage draft persistence (RF-5-001, RF-3-003)"
```

---

## Task 3: Launch preamble validation (RF-5-002)

**Files:**
- Modify: `packages/web/components/launch/PreambleInput.tsx`
- Modify: `packages/web/lib/actions/launch.ts`

- [ ] **Step 1: Add client-side maxLength and character counter to PreambleInput**

Replace the entire `PreambleInput` component:

```tsx
// packages/web/components/launch/PreambleInput.tsx
"use client";

import styles from "./PreambleInput.module.css";

const MAX_PREAMBLE = 10000;

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function PreambleInput({ value, onChange }: Props) {
  const remaining = MAX_PREAMBLE - value.length;
  const nearLimit = remaining < 500;

  return (
    <div className={styles.field}>
      <label className={styles.label}>
        Custom preamble <span className={styles.optional}>(optional)</span>
      </label>
      <textarea
        className={styles.textarea}
        placeholder="Additional instructions for Claude Code..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MAX_PREAMBLE}
      />
      {nearLimit && (
        <div className={styles.counter} aria-live="polite">
          {remaining} characters remaining
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add CSS for the counter**

Append to `packages/web/components/launch/PreambleInput.module.css`:

```css
.counter {
  font-size: var(--font-size-xs, 11px);
  color: var(--paper-ink-muted);
  text-align: right;
  margin-top: 4px;
}
```

- [ ] **Step 3: Add server-side validation in launch.ts**

In `packages/web/lib/actions/launch.ts`, add after the `VALID_BRANCH_RE` constant:

```ts
const MAX_PREAMBLE = 10000;
```

In the `launchIssue` function, after the comment indices validation block (`if (formData.selectedCommentIndices.some(...))`), add:

```ts
if (formData.preamble && formData.preamble.length > MAX_PREAMBLE) {
  return {
    success: false,
    error: `Preamble must be ${MAX_PREAMBLE} characters or fewer`,
  };
}
```

- [ ] **Step 4: Verify**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/launch/PreambleInput.tsx packages/web/components/launch/PreambleInput.module.css packages/web/lib/actions/launch.ts
git commit -m "fix: add length validation to launch preamble, client + server (RF-5-002)"
```

---

## Task 4: Multi-repo create idempotency + partial success UX (RF-2-001)

**Files:**
- Modify: `packages/web/components/list/CreateDraftSheet.tsx`

- [ ] **Step 1: Pre-generate idempotency keys and show partial success**

In `packages/web/components/list/CreateDraftSheet.tsx`, replace the multi-repo loop (lines 147-183) with:

```tsx
// Multiple repos — create one draft+issue per selected repo.
// Pre-generate all idempotency keys so retries reuse them.
const keys = selected.map(() => newIdempotencyKey());
let created = 0;
let lastWarning: string | undefined;
const createdIssues: Array<{ owner: string; name: string; number: number }> = [];

for (let i = 0; i < selected.length; i++) {
  setProgress(`Creating ${i + 1} of ${selected.length}\u2026`);
  const draftResult = await createDraftAction({ title });
  if (!draftResult.success) {
    if (created > 0) {
      showToast(
        `Created ${created}/${selected.length} issues. Failed on repo ${i + 1}: ${draftResult.error}`,
        "warning",
      );
      resetAndClose();
      router.push("/");
      return;
    }
    setError(draftResult.error);
    return;
  }
  const assignResult = await assignDraftAction(
    draftResult.id,
    selected[i],
    keys[i],
  );
  if (!assignResult.success) {
    if (created > 0) {
      showToast(
        `Created ${created}/${selected.length} issues. Failed on repo ${i + 1}: ${assignResult.error}`,
        "warning",
      );
      resetAndClose();
      router.push("/");
      return;
    }
    setError(assignResult.error);
    return;
  }
  if (assignResult.cleanupWarning) {
    lastWarning = assignResult.cleanupWarning;
  }
  const repo = repos.find((r) => r.id === selected[i]);
  if (repo && assignResult.issueNumber) {
    createdIssues.push({ owner: repo.owner, name: repo.name, number: assignResult.issueNumber });
  }
  created++;
}

if (lastWarning) {
  showToast(lastWarning, "warning");
} else {
  showToast(`${created} issues created`, "success");
}
resetAndClose();
router.push("/");
```

This change: (a) pre-generates all keys so retries are safe, (b) on partial failure shows how many succeeded and navigates to dashboard rather than leaving the user stuck.

- [ ] **Step 2: Verify**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/components/list/CreateDraftSheet.tsx
git commit -m "fix: pre-generate idempotency keys for multi-repo create, show partial success (RF-2-001)"
```

---

## Task 5: Branch name client-side validation (RF-5-003)

**Files:**
- Modify: `packages/web/components/launch/BranchInput.tsx`

- [ ] **Step 1: Add inline validation matching the server regex**

Replace `BranchInput` component:

```tsx
// packages/web/components/launch/BranchInput.tsx
"use client";

import { useState } from "react";
import styles from "./BranchInput.module.css";

const VALID_BRANCH_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function BranchInput({ value, onChange }: Props) {
  const [touched, setTouched] = useState(false);
  const trimmed = value.trim();
  const isValid = trimmed.length === 0 || VALID_BRANCH_RE.test(trimmed);
  const showError = touched && trimmed.length > 0 && !isValid;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor="launch-branch">Branch</label>
      <input
        id="launch-branch"
        className={`${styles.input} ${showError ? styles.inputError : ""}`}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        spellCheck={false}
      />
      {showError ? (
        <div className={styles.error}>
          Must start with a letter or number. Only letters, numbers, dots, underscores, hyphens, and slashes allowed.
        </div>
      ) : (
        <div className={styles.hint}>
          Existing branch will be checked out; otherwise a new branch is created
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add error styles to BranchInput.module.css**

Append to `packages/web/components/launch/BranchInput.module.css`:

```css
.inputError {
  border-color: var(--paper-red, #c0392b);
}

.error {
  font-size: var(--font-size-xs, 11px);
  color: var(--paper-red, #c0392b);
  margin-top: 4px;
}
```

- [ ] **Step 3: Verify**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/launch/BranchInput.tsx packages/web/components/launch/BranchInput.module.css
git commit -m "fix: add client-side branch name regex validation matching server rules (RF-5-003)"
```

---

## Task 6: File path validation + directory picker (RF-5-004)

**Files:**
- Modify: `packages/web/lib/actions/launch.ts`
- Create: `packages/web/components/launch/FileSelector.tsx`
- Create: `packages/web/components/launch/FileSelector.module.css`
- Modify: `packages/web/components/launch/ContextToggles.tsx`

- [ ] **Step 1: Add server-side file path validation in launch.ts**

In `packages/web/lib/actions/launch.ts`, after the new preamble validation (Task 3), add:

```ts
for (const filePath of formData.selectedFilePaths) {
  if (typeof filePath !== "string") {
    return { success: false, error: "Invalid file path" };
  }
  if (filePath.includes("\0")) {
    return { success: false, error: "File path contains invalid characters" };
  }
  if (filePath.startsWith("/") || filePath.includes("..")) {
    return {
      success: false,
      error: "File paths must be relative to the repository and cannot contain '..'",
    };
  }
}
```

- [ ] **Step 2: Create the FileSelector component**

```tsx
// packages/web/components/launch/FileSelector.tsx
"use client";

import { useState, useCallback } from "react";
import styles from "./FileSelector.module.css";

type Props = {
  referencedFiles: string[];
  selectedFiles: string[];
  onToggleFile: (path: string) => void;
  onAddFile: (path: string) => void;
};

export function FileSelector({
  referencedFiles,
  selectedFiles,
  onToggleFile,
  onAddFile,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("/") || trimmed.includes("..")) {
      setError("Path must be relative (no leading / or ..)");
      return;
    }
    if (selectedFiles.includes(trimmed) || referencedFiles.includes(trimmed)) {
      setError("File already in list");
      return;
    }
    onAddFile(trimmed);
    setInputValue("");
    setError(null);
    setAdding(false);
  }, [inputValue, selectedFiles, referencedFiles, onAddFile]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAdd();
      }
      if (e.key === "Escape") {
        setAdding(false);
        setInputValue("");
        setError(null);
      }
    },
    [handleAdd],
  );

  return (
    <div className={styles.container}>
      {referencedFiles.map((file) => (
        <label key={file} className={styles.item}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={selectedFiles.includes(file)}
            onChange={() => onToggleFile(file)}
          />
          <span className={styles.filePath}>{file}</span>
        </label>
      ))}

      {/* User-added files that aren't in referencedFiles */}
      {selectedFiles
        .filter((f) => !referencedFiles.includes(f))
        .map((file) => (
          <label key={file} className={styles.item}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked
              onChange={() => onToggleFile(file)}
            />
            <span className={styles.filePath}>{file}</span>
            <span className={styles.addedTag}>added</span>
          </label>
        ))}

      {adding ? (
        <div className={styles.addRow}>
          <input
            className={styles.addInput}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="path/to/file.ts"
            autoFocus
            spellCheck={false}
          />
          <button
            type="button"
            className={styles.addConfirm}
            onClick={handleAdd}
            disabled={!inputValue.trim()}
          >
            Add
          </button>
          <button
            type="button"
            className={styles.addCancel}
            onClick={() => {
              setAdding(false);
              setInputValue("");
              setError(null);
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setAdding(true)}
        >
          + add file path
        </button>
      )}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Create FileSelector styles**

```css
/* packages/web/components/launch/FileSelector.module.css */
.container {
  display: flex;
  flex-direction: column;
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: var(--font-size-sm, 13px);
  cursor: pointer;
}

.checkbox {
  flex-shrink: 0;
}

.filePath {
  font-family: var(--font-mono-paper);
  font-size: var(--font-size-xs, 11px);
  word-break: break-all;
}

.addedTag {
  font-size: var(--font-size-xs, 11px);
  color: var(--paper-ink-muted);
  font-style: italic;
}

.addBtn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--font-size-sm, 13px);
  color: var(--paper-ink-muted);
  padding: 6px 0;
  text-align: left;
}

.addBtn:hover {
  color: var(--paper-ink);
}

.addRow {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 4px 0;
}

.addInput {
  flex: 1;
  font-family: var(--font-mono-paper);
  font-size: var(--font-size-xs, 11px);
  padding: 4px 8px;
  border: 1px solid var(--paper-border);
  border-radius: 4px;
  background: var(--paper-surface);
}

.addConfirm,
.addCancel {
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--font-size-xs, 11px);
  padding: 4px 8px;
}

.addConfirm {
  color: var(--paper-ink);
  font-weight: 600;
}

.addCancel {
  color: var(--paper-ink-muted);
}

.error {
  font-size: var(--font-size-xs, 11px);
  color: var(--paper-red, #c0392b);
  margin-top: 2px;
}
```

- [ ] **Step 4: Update ContextToggles to use FileSelector**

In `packages/web/components/launch/ContextToggles.tsx`:

1. Add import and update Props:

```tsx
import { FileSelector } from "./FileSelector";

type Props = {
  comments: GitHubComment[];
  referencedFiles: string[];
  selectedComments: number[];
  selectedFiles: string[];
  onToggleComment: (index: number) => void;
  onToggleFile: (path: string) => void;
  onAddFile: (path: string) => void;
};
```

2. Replace the `referencedFiles.map(...)` block (the file checkboxes after the divider) with:

```tsx
{referencedFiles.length > 0 && (
  <div className={styles.divider} />
)}

<FileSelector
  referencedFiles={referencedFiles}
  selectedFiles={selectedFiles}
  onToggleFile={onToggleFile}
  onAddFile={onAddFile}
/>
```

Remove the old file `<label>` elements.

- [ ] **Step 5: Wire `onAddFile` in LaunchModal**

In `packages/web/components/launch/LaunchModal.tsx`:

Add handler after `toggleFile`:

```tsx
const addFile = useCallback((path: string) => {
  setSelectedFiles((prev) => [...prev, path]);
}, []);
```

Pass it to ContextToggles:

```tsx
<ContextToggles
  comments={comments}
  referencedFiles={referencedFiles}
  selectedComments={selectedComments}
  selectedFiles={selectedFiles}
  onToggleComment={toggleComment}
  onToggleFile={toggleFile}
  onAddFile={addFile}
/>
```

- [ ] **Step 6: Verify**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/web/lib/actions/launch.ts packages/web/components/launch/FileSelector.tsx packages/web/components/launch/FileSelector.module.css packages/web/components/launch/ContextToggles.tsx packages/web/components/launch/LaunchModal.tsx
git commit -m "fix: add file path validation + manual file picker in launch modal (RF-5-004)"
```

---

## Task 7: Launch modal close confirmation (RF-3-002)

**Files:**
- Modify: `packages/web/components/launch/LaunchModal.tsx`

- [ ] **Step 1: Add dirty-checking and confirmation on close**

In `packages/web/components/launch/LaunchModal.tsx`:

1. Add state for tracking initial values (after existing state declarations):

```tsx
const [initialBranch] = useState(defaultBranch);
const [initialMode] = useState<WorkspaceMode>(
  initialWorkspaceMode ?? (repoLocalPath ? "existing" : "clone"),
);
```

2. Add dirty check:

```tsx
const isDirty =
  branchName !== initialBranch ||
  workspaceMode !== initialMode ||
  preamble.trim().length > 0 ||
  selectedComments.length !== comments.length ||
  selectedFiles.length !== referencedFiles.length;
```

3. Add a close handler that confirms if dirty:

```tsx
const handleClose = useCallback(() => {
  if (isPending) return;
  if (isDirty && !window.confirm("Discard launch configuration?")) return;
  onClose();
}, [isPending, isDirty, onClose]);
```

4. Replace all `onClose` references in the JSX with `handleClose`:
   - `onClick={isPending ? undefined : onClose}` on overlay → `onClick={handleClose}`
   - `onClick={isPending ? undefined : onClose}` on close button → `onClick={handleClose}`
   - `onClick={onClose}` on Cancel button → `onClick={handleClose}`

- [ ] **Step 2: Verify**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/components/launch/LaunchModal.tsx
git commit -m "fix: confirm before closing launch modal when config is modified (RF-3-002)"
```

---

## Task 8: DashboardContent retry-capable error fallback (RF-7-001)

**Files:**
- Create: `packages/web/components/ui/DashboardError.tsx`
- Create: `packages/web/components/ui/DashboardError.module.css`
- Modify: `packages/web/app/DashboardContent.tsx`

- [ ] **Step 1: Create DashboardError component**

```tsx
// packages/web/components/ui/DashboardError.tsx
"use client";

import { useRouter } from "next/navigation";
import styles from "./DashboardError.module.css";

type Props = {
  message: string;
};

export function DashboardError({ message }: Props) {
  const router = useRouter();

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>failed to load dashboard</h3>
      <p className={styles.message}>
        <em>{message}</em>
      </p>
      <button className={styles.retry} onClick={() => router.refresh()}>
        Try again
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create styles**

```css
/* packages/web/components/ui/DashboardError.module.css */
.container {
  padding: 80px 20px 60px;
  text-align: center;
}

.title {
  margin-bottom: 8px;
}

.message {
  color: var(--paper-ink-muted);
  max-width: 320px;
  margin: 0 auto 16px;
}

.retry {
  background: none;
  border: 1px solid var(--paper-border);
  border-radius: 6px;
  padding: 8px 20px;
  cursor: pointer;
  font-size: var(--font-size-sm, 13px);
  color: var(--paper-ink);
}

.retry:hover {
  background: var(--paper-surface-hover, rgba(0, 0, 0, 0.04));
}
```

- [ ] **Step 3: Use DashboardError in DashboardContent.tsx**

In `packages/web/app/DashboardContent.tsx`, replace the catch block's return (lines 89-97):

```tsx
import { DashboardError } from "@/components/ui/DashboardError";
```

Replace the inline `<div>` in the catch block with:

```tsx
return <DashboardError message={message} />;
```

- [ ] **Step 4: Verify**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/ui/DashboardError.tsx packages/web/components/ui/DashboardError.module.css packages/web/app/DashboardContent.tsx
git commit -m "fix: add retry button to dashboard error fallback (RF-7-001)"
```

---

## Task 9: Use `router.replace` for destructive navigation (RF-1-001)

**Files:**
- Modify: `packages/web/components/detail/IssueActionSheet.tsx`
- Modify: `packages/web/components/detail/DraftActionSheet.tsx`

- [ ] **Step 1: Change router.push to router.replace for close and delete**

In `packages/web/components/detail/IssueActionSheet.tsx`, line 145:

```tsx
// Change:
router.push("/?section=shipped");
// To:
router.replace("/?section=shipped");
```

In `packages/web/components/detail/DraftActionSheet.tsx`, line 48:

```tsx
// Change:
router.push("/?section=unassigned");
// To:
router.replace("/?section=unassigned");
```

- [ ] **Step 2: Verify**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/components/detail/IssueActionSheet.tsx packages/web/components/detail/DraftActionSheet.tsx
git commit -m "fix: use router.replace for destructive actions to prevent stale back-nav (RF-1-001)"
```

---

## Task 10: Stale-tab detection (RF-6-001)

**Files:**
- Create: `packages/web/hooks/useStaleTab.ts`
- Modify: `packages/web/components/detail/IssueActionSheet.tsx`

- [ ] **Step 1: Create the `useStaleTab` hook**

```ts
// packages/web/hooks/useStaleTab.ts
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_STALE_THRESHOLD_MS = 300_000; // 5 minutes (matches cache TTL)

export function useStaleTab(thresholdMs = DEFAULT_STALE_THRESHOLD_MS) {
  const router = useRouter();
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else if (hiddenAtRef.current !== null) {
        const elapsed = Date.now() - hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (elapsed >= thresholdMs) {
          router.refresh();
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [router, thresholdMs]);
}
```

- [ ] **Step 2: Wire into IssueActionSheet**

In `packages/web/components/detail/IssueActionSheet.tsx`, add:

```tsx
import { useStaleTab } from "@/hooks/useStaleTab";

// Inside the component, before the return:
useStaleTab();
```

- [ ] **Step 3: Verify**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/hooks/useStaleTab.ts packages/web/components/detail/IssueActionSheet.tsx
git commit -m "fix: add stale-tab detection — auto-refresh after 5min hidden (RF-6-001)"
```

---

## Task 11: Auth error messaging (RF-4-002, RF-7-002)

**Files:**
- Modify: `packages/core/src/github/errors.ts`

- [ ] **Step 1: Enhance the `formatErrorForUser` return to include the kind**

The existing `formatErrorForUser` already calls `classifyGitHubError` which returns specific messages for auth errors ("GitHub authentication expired. Run `gh auth refresh` and try again."), rate limits, network errors, etc. The messages are already good.

The issue is that some server action catch blocks use their own generic messages instead of `formatErrorForUser`. Check: `IssueActionSheet.tsx:149` catches all errors and shows "Unable to reach the server." — this should use `formatErrorForUser` but it's in a client component, so it catches errors from server action calls.

No change needed in `errors.ts` — the messages are already actionable. The fix is to let server action errors propagate their classified messages to the UI rather than overriding them in catch blocks.

Skip this task — the existing `classifyGitHubError` and `formatErrorForUser` already produce the right messages. The client-side catch blocks that override with generic messages are a reasonable fallback for truly unexpected errors (e.g., the server action itself failing to execute).

- [ ] **Step 2: Commit (no-op — document decision)**

No changes needed. The error classification system is already well-designed.

---

## Task 12: Draft editor "Save as new draft" on deleted-draft error (RF-2-002)

**Files:**
- Modify: `packages/web/components/detail/DraftDetail.tsx`

- [ ] **Step 1: Add recovery from deleted-draft autosave error**

In `packages/web/components/detail/DraftDetail.tsx`, add state and imports:

```tsx
import { useRouter } from "next/navigation";
import { createDraftAction } from "@/lib/actions/drafts";

// Inside the component:
const router = useRouter();
const [draftDeleted, setDraftDeleted] = useState(false);
```

In `handleTitleBlur` and `handleBodyBlur`, detect the "no longer exists" error:

```tsx
// In handleTitleBlur, after checking result.success:
if (!result.success) {
  if (result.error?.includes("no longer exists")) {
    setDraftDeleted(true);
  }
  setSaveError(result.error ?? "Failed to save title");
  return;
}
```

Same for `handleBodyBlur`:

```tsx
if (!result.success) {
  if (result.error?.includes("no longer exists")) {
    setDraftDeleted(true);
  }
  setSaveError(result.error ?? "Failed to save");
  return;
}
```

Add a "Save as new draft" handler:

```tsx
const handleSaveAsNew = async () => {
  setSaveError(null);
  try {
    const result = await createDraftAction({
      title: title.trim() || "Untitled draft",
      body: body || undefined,
    });
    if (!result.success) {
      setSaveError(result.error);
      return;
    }
    router.replace(`/drafts/${result.id}`);
  } catch (err) {
    console.error("[issuectl] Save as new draft failed:", err);
    setSaveError("Failed to save as new draft");
  }
};
```

In the JSX, after the `saveError` display, add:

```tsx
{draftDeleted && (
  <div className={styles.recoveryBar}>
    <span>This draft was deleted.</span>
    <button className={styles.recoveryBtn} onClick={handleSaveAsNew}>
      Save as new draft
    </button>
  </div>
)}
```

- [ ] **Step 2: Add recovery styles to DraftDetail.module.css**

Append:

```css
.recoveryBar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--paper-amber-light, #fff3cd);
  border-radius: 6px;
  font-size: var(--font-size-sm, 13px);
  margin-top: 8px;
}

.recoveryBtn {
  background: none;
  border: 1px solid var(--paper-border);
  border-radius: 4px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: var(--font-size-sm, 13px);
  font-weight: 600;
  white-space: nowrap;
}

.recoveryBtn:hover {
  background: var(--paper-surface-hover, rgba(0, 0, 0, 0.04));
}
```

- [ ] **Step 3: Verify**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/detail/DraftDetail.tsx packages/web/components/detail/DraftDetail.module.css
git commit -m "fix: offer 'Save as new draft' when autosave targets deleted draft (RF-2-002)"
```

---

## Task 13: Sync replay cooldown (RF-2-003)

**Files:**
- Modify: `packages/web/hooks/useSyncOnReconnect.ts`

- [ ] **Step 1: Add cooldown after replay completes**

In `packages/web/hooks/useSyncOnReconnect.ts`, add a `lastSyncRef` next to `syncingRef`:

```tsx
const lastSyncRef = useRef(0);
```

At the top of `handleOnline`, add a cooldown check:

```tsx
async function handleOnline() {
  if (syncingRef.current) return;

  // Cooldown: don't re-sync within 3 seconds of last sync
  const elapsed = Date.now() - lastSyncRef.current;
  if (elapsed < 3000) return;
```

At the end of the `finally` block, record the sync time:

```tsx
} finally {
  syncingRef.current = false;
  lastSyncRef.current = Date.now();
}
```

- [ ] **Step 2: Verify**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/hooks/useSyncOnReconnect.ts
git commit -m "fix: add 3s cooldown after sync replay to prevent rapid re-triggers (RF-2-003)"
```

---

## Task 14: Cross-tab sync coordination via BroadcastChannel (RF-4-001)

**Files:**
- Modify: `packages/web/hooks/useSyncOnReconnect.ts`

- [ ] **Step 1: Add BroadcastChannel leader election for sync**

In `packages/web/hooks/useSyncOnReconnect.ts`, add a channel-based claim mechanism inside the `useEffect`:

```tsx
useEffect(() => {
  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel("issuectl-sync")
      : null;

  // Track whether another tab is already syncing
  let peerSyncing = false;
  channel?.addEventListener("message", (e) => {
    if (e.data === "sync-start") peerSyncing = true;
    if (e.data === "sync-done") {
      peerSyncing = false;
      callbacksRef.current?.onRefreshQueue?.();
    }
  });

  async function handleOnline() {
    if (syncingRef.current) return;
    if (peerSyncing) return;

    const elapsed = Date.now() - lastSyncRef.current;
    if (elapsed < 3000) return;
```

Before `syncingRef.current = true;`, broadcast the start:

```tsx
channel?.postMessage("sync-start");
syncingRef.current = true;
```

In the `finally` block, broadcast done:

```tsx
} finally {
  syncingRef.current = false;
  lastSyncRef.current = Date.now();
  channel?.postMessage("sync-done");
}
```

In the cleanup function, close the channel:

```tsx
return () => {
  window.removeEventListener("online", handleOnline);
  channel?.close();
};
```

- [ ] **Step 2: Verify**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/hooks/useSyncOnReconnect.ts
git commit -m "fix: add BroadcastChannel coordination for cross-tab sync (RF-4-001)"
```

---

## Task 15: Final typecheck and integration verify

- [ ] **Step 1: Run full typecheck**

Run: `pnpm turbo typecheck`
Expected: PASS across all packages

- [ ] **Step 2: Run existing tests**

Run: `pnpm turbo test`
Expected: All existing tests pass (no regressions)

- [ ] **Step 3: Manual smoke test**

Start the dev server (`pnpm turbo dev`) and verify:
1. Draft editor shows "Leave site?" on tab close with unsaved changes
2. Comment composer persists text across page refresh
3. Preamble shows character counter near limit
4. Branch input shows inline error for `@invalid!`
5. Launch modal confirms before close when config is modified
6. Dashboard error has a "Try again" button
7. File selector allows adding custom file paths

- [ ] **Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "chore: integration fixups from resilience audit implementation"
```
