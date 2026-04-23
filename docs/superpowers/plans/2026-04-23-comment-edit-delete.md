# Comment Edit & Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the ability to edit and delete your own issue comments in the issuectl dashboard, synced with GitHub.

**Architecture:** Three-layer approach matching existing patterns — GitHub functions (`issues.ts`), cached data layer (`data/comments.ts`), and server actions (`actions/comments.ts`). A new `CommentItem` client component handles inline edit and timed delete confirmation. `getCurrentUserLogin` (new `data/user.ts`) identifies comment ownership.

**Tech Stack:** Octokit REST API, better-sqlite3 SWR cache, Next.js Server Actions, React client components, CSS Modules

---

### Task 1: Core GitHub layer — `updateComment` and `deleteComment`

**Files:**
- Modify: `packages/core/src/github/issues.ts`
- Modify: `packages/core/src/github/issues.test.ts`

- [ ] **Step 1: Add `updateComment` and `deleteComment` mock methods to `makeOctokit`**

In `packages/core/src/github/issues.test.ts`, add the two new mock methods to the `makeOctokit` helper:

```ts
function makeOctokit() {
  const paginate = vi.fn() as MockFn;
  const get = vi.fn() as MockFn;
  const create = vi.fn() as MockFn;
  const update = vi.fn() as MockFn;
  const listComments = vi.fn() as MockFn;
  const createComment = vi.fn() as MockFn;
  const updateComment = vi.fn() as MockFn;
  const deleteComment = vi.fn() as MockFn;
  const listForRepo = vi.fn() as MockFn;

  const octokit = {
    paginate,
    rest: {
      issues: { listForRepo, get, create, update, listComments, createComment, updateComment, deleteComment },
    },
  } as unknown as Octokit;

  return { octokit, paginate, get, create, update, listComments, createComment, updateComment, deleteComment, listForRepo };
}
```

- [ ] **Step 2: Write failing tests for `updateComment`**

Add to `packages/core/src/github/issues.test.ts`, after the existing `addComment` describe block:

```ts
describe("updateComment", () => {
  it("updates a comment and returns mapped result", async () => {
    const { octokit, updateComment: updateCommentMock } = makeOctokit();
    const updatedRaw = { ...RAW_COMMENT, body: "Updated body" };
    updateCommentMock.mockResolvedValue({ data: updatedRaw });

    const result = await updateComment(octokit, "owner", "repo", 100, "Updated body");
    expect(result.body).toBe("Updated body");
    expect(result.id).toBe(100);
    expect(result.user?.login).toBe("bob");
    expect(updateCommentMock).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      comment_id: 100,
      body: "Updated body",
    });
  });

  it("propagates API errors", async () => {
    const { octokit, updateComment: updateCommentMock } = makeOctokit();
    updateCommentMock.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );

    await expect(updateComment(octokit, "owner", "repo", 999, "body")).rejects.toThrow("Not Found");
  });
});
```

Also add the import for `updateComment` at the top of the file:

```ts
import {
  listIssues,
  getIssue,
  createIssue,
  updateIssue,
  closeIssue,
  getComments,
  addComment,
  updateComment,
  deleteComment,
  reassignIssue,
} from "./issues.js";
```

- [ ] **Step 3: Write failing tests for `deleteComment`**

Add to `packages/core/src/github/issues.test.ts`, after the `updateComment` describe block:

```ts
describe("deleteComment", () => {
  it("deletes a comment", async () => {
    const { octokit, deleteComment: deleteCommentMock } = makeOctokit();
    deleteCommentMock.mockResolvedValue(undefined);

    await deleteComment(octokit, "owner", "repo", 100);
    expect(deleteCommentMock).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      comment_id: 100,
    });
  });

  it("propagates API errors", async () => {
    const { octokit, deleteComment: deleteCommentMock } = makeOctokit();
    deleteCommentMock.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );

    await expect(deleteComment(octokit, "owner", "repo", 999)).rejects.toThrow("Not Found");
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm --filter @issuectl/core test -- --run packages/core/src/github/issues.test.ts`
Expected: FAIL — `updateComment` and `deleteComment` are not exported from `./issues.js`

- [ ] **Step 5: Implement `updateComment` and `deleteComment`**

Add to `packages/core/src/github/issues.ts`, after the existing `addComment` function (before `ReassignResult`):

```ts
export async function updateComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  commentId: number,
  body: string,
): Promise<GitHubComment> {
  const { data } = await octokit.rest.issues.updateComment({
    owner,
    repo,
    comment_id: commentId,
    body,
  });
  return mapComment(data);
}

export async function deleteComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  commentId: number,
): Promise<void> {
  await octokit.rest.issues.deleteComment({
    owner,
    repo,
    comment_id: commentId,
  });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/core test -- --run packages/core/src/github/issues.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Type-check**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/github/issues.ts packages/core/src/github/issues.test.ts
git commit -m "feat(core): add updateComment and deleteComment GitHub functions"
```

---

### Task 2: Core data layer — `editComment` and `removeComment`

**Files:**
- Modify: `packages/core/src/data/comments.ts`
- Modify: `packages/core/src/data/comments.test.ts`

- [ ] **Step 1: Write failing tests for `editComment`**

Add to `packages/core/src/data/comments.test.ts`. First, update the mock and imports:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "../db/test-helpers.js";
import { setCached, getCached } from "../db/cache.js";
import { addComment, editComment, removeComment } from "./comments.js";

vi.mock("../github/issues.js", () => ({
  addComment: vi.fn().mockResolvedValue({
    id: 200,
    body: "test comment",
    user: { login: "alice", avatarUrl: "https://avatar.test/alice" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    htmlUrl: "https://github.com/owner/repo/issues/1#issuecomment-200",
  }),
  getComments: vi.fn(),
  updateComment: vi.fn().mockResolvedValue({
    id: 200,
    body: "updated comment",
    user: { login: "alice", avatarUrl: "https://avatar.test/alice" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    htmlUrl: "https://github.com/owner/repo/issues/1#issuecomment-200",
  }),
  deleteComment: vi.fn().mockResolvedValue(undefined),
}));
```

Then add the test after the existing `addComment` describe block:

```ts
describe("editComment (data layer)", () => {
  it("clears all 4 cache keys after editing", async () => {
    for (const key of CACHE_KEYS) {
      setCached(db, key, { placeholder: true });
    }
    for (const key of CACHE_KEYS) {
      expect(getCached(db, key)).not.toBeNull();
    }

    const result = await editComment(db, octokit, OWNER, REPO, ISSUE, 200, "updated body");

    for (const key of CACHE_KEYS) {
      expect(getCached(db, key)).toBeNull();
    }
    expect(result.body).toBe("updated comment");
  });
});
```

- [ ] **Step 2: Write failing tests for `removeComment`**

Add after the `editComment` describe block:

```ts
describe("removeComment (data layer)", () => {
  it("clears all 4 cache keys after deleting", async () => {
    for (const key of CACHE_KEYS) {
      setCached(db, key, { placeholder: true });
    }
    for (const key of CACHE_KEYS) {
      expect(getCached(db, key)).not.toBeNull();
    }

    await removeComment(db, octokit, OWNER, REPO, ISSUE, 200);

    for (const key of CACHE_KEYS) {
      expect(getCached(db, key)).toBeNull();
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @issuectl/core test -- --run packages/core/src/data/comments.test.ts`
Expected: FAIL — `editComment` and `removeComment` are not exported

- [ ] **Step 4: Implement `editComment` and `removeComment`**

Add to `packages/core/src/data/comments.ts`. First, update the import:

```ts
import {
  getComments as fetchComments,
  addComment as postComment,
  updateComment as patchComment,
  deleteComment as destroyComment,
} from "../github/issues.js";
```

Then add after the existing `addComment` function:

```ts
export async function editComment(
  db: Database.Database,
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  commentId: number,
  body: string,
): Promise<GitHubComment> {
  const comment = await patchComment(octokit, owner, repo, commentId, body);
  clearCacheKey(db, `comments:${owner}/${repo}#${issueNumber}`);
  clearCacheKey(db, `issue-content:${owner}/${repo}#${issueNumber}`);
  clearCacheKey(db, `issue-detail:${owner}/${repo}#${issueNumber}`);
  clearCacheKey(db, `pull-detail:${owner}/${repo}#${issueNumber}`);
  return comment;
}

export async function removeComment(
  db: Database.Database,
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  commentId: number,
): Promise<void> {
  await destroyComment(octokit, owner, repo, commentId);
  clearCacheKey(db, `comments:${owner}/${repo}#${issueNumber}`);
  clearCacheKey(db, `issue-content:${owner}/${repo}#${issueNumber}`);
  clearCacheKey(db, `issue-detail:${owner}/${repo}#${issueNumber}`);
  clearCacheKey(db, `pull-detail:${owner}/${repo}#${issueNumber}`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/core test -- --run packages/core/src/data/comments.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Type-check**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/data/comments.ts packages/core/src/data/comments.test.ts
git commit -m "feat(core): add editComment and removeComment data layer functions"
```

---

### Task 3: Core `getCurrentUserLogin`

**Files:**
- Create: `packages/core/src/data/user.ts`
- Create: `packages/core/src/data/user.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/core/src/data/user.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "../db/test-helpers.js";
import { setCached, getCached } from "../db/cache.js";
import { getCurrentUserLogin } from "./user.js";

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

function makeOctokit(login: string) {
  return {
    rest: {
      users: {
        getAuthenticated: vi.fn().mockResolvedValue({
          data: { login },
        }),
      },
    },
  } as unknown as Parameters<typeof getCurrentUserLogin>[1];
}

describe("getCurrentUserLogin", () => {
  it("returns the authenticated user login", async () => {
    const octokit = makeOctokit("alice");

    const login = await getCurrentUserLogin(db, octokit);
    expect(login).toBe("alice");
  });

  it("caches the result", async () => {
    const octokit = makeOctokit("alice");

    await getCurrentUserLogin(db, octokit);
    await getCurrentUserLogin(db, octokit);

    // Should only call the API once
    expect(octokit.rest.users.getAuthenticated).toHaveBeenCalledTimes(1);
  });

  it("returns from cache on subsequent calls", async () => {
    const octokit = makeOctokit("alice");

    // Prime the cache
    setCached(db, "current-user", "alice");

    const login = await getCurrentUserLogin(db, octokit);
    expect(login).toBe("alice");
    // Should not call the API — served from cache
    expect(octokit.rest.users.getAuthenticated).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @issuectl/core test -- --run packages/core/src/data/user.test.ts`
Expected: FAIL — `./user.js` does not exist

- [ ] **Step 3: Implement `getCurrentUserLogin`**

Create `packages/core/src/data/user.ts`:

```ts
import type { Octokit } from "@octokit/rest";
import type Database from "better-sqlite3";
import { getCached, setCached } from "../db/cache.js";

const CACHE_KEY = "current-user";

export async function getCurrentUserLogin(
  db: Database.Database,
  octokit: Octokit,
): Promise<string> {
  const cached = getCached<string>(db, CACHE_KEY);
  if (cached) return cached.data;

  const { data } = await octokit.rest.users.getAuthenticated();
  const login = data.login;
  setCached(db, CACHE_KEY, login);
  return login;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @issuectl/core test -- --run packages/core/src/data/user.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Type-check**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/data/user.ts packages/core/src/data/user.test.ts
git commit -m "feat(core): add getCurrentUserLogin with SWR caching"
```

---

### Task 4: Core exports

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add re-exports**

In `packages/core/src/index.ts`, update the comments export block:

```ts
export {
  getComments,
  addComment,
  editComment,
  removeComment,
} from "./data/comments.js";
```

And add a new export line after the comments block:

```ts
export { getCurrentUserLogin } from "./data/user.js";
```

- [ ] **Step 2: Type-check**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): re-export editComment, removeComment, getCurrentUserLogin"
```

---

### Task 5: Server actions — `editComment` and `deleteComment`

**Files:**
- Modify: `packages/web/lib/actions/comments.ts`
- Create: `packages/web/lib/actions/comments.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web/lib/actions/comments.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @issuectl/core before importing the actions under test.
// ---------------------------------------------------------------------------

const editCommentMock = vi.hoisted(() => vi.fn());
const removeCommentMock = vi.hoisted(() => vi.fn());
const getDbMock = vi.hoisted(() => vi.fn(() => ({})));
const getRepoMock = vi.hoisted(() => vi.fn(() => ({ id: 1, owner: "acme", name: "web" })));
const withAuthRetryMock = vi.hoisted(() =>
  vi.fn((fn: (octokit: unknown) => unknown) => fn({})),
);
const formatErrorForUserMock = vi.hoisted(() =>
  vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
);

vi.mock("@issuectl/core", () => ({
  getDb: getDbMock,
  getRepo: getRepoMock,
  editComment: editCommentMock,
  removeComment: removeCommentMock,
  withAuthRetry: withAuthRetryMock,
  formatErrorForUser: formatErrorForUserMock,
}));

vi.mock("@/lib/revalidate", () => ({
  revalidateSafely: vi.fn(() => ({ stale: false })),
}));

// Import AFTER mocks are in place.
const { editComment, deleteComment } = await import("./comments.js");

// ---------------------------------------------------------------------------
// editComment
// ---------------------------------------------------------------------------

describe("editComment action", () => {
  it("rejects empty body", async () => {
    const result = await editComment("acme", "web", 1, 100, "   ");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid input/i);
  });

  it("rejects body exceeding 65536 chars", async () => {
    const longBody = "x".repeat(65537);
    const result = await editComment("acme", "web", 1, 100, longBody);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/65.?536/);
  });

  it("rejects invalid owner", async () => {
    const result = await editComment("../bad", "web", 1, 100, "hello");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid input/i);
  });

  it("rejects invalid repo", async () => {
    const result = await editComment("acme", "../bad", 1, 100, "hello");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid input/i);
  });

  it("succeeds with valid input", async () => {
    editCommentMock.mockResolvedValue({
      id: 100,
      body: "updated",
      user: null,
      createdAt: "",
      updatedAt: "",
      htmlUrl: "",
    });

    const result = await editComment("acme", "web", 1, 100, "updated");
    expect(result.success).toBe(true);
  });

  it("returns error when repo is not tracked", async () => {
    getRepoMock.mockReturnValueOnce(null);
    const result = await editComment("acme", "web", 1, 100, "hello");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not tracked/i);
  });

  it("returns formatted error on API failure", async () => {
    withAuthRetryMock.mockRejectedValueOnce(new Error("API failure"));
    const result = await editComment("acme", "web", 1, 100, "hello");
    expect(result.success).toBe(false);
    expect(result.error).toBe("API failure");
  });
});

// ---------------------------------------------------------------------------
// deleteComment
// ---------------------------------------------------------------------------

describe("deleteComment action", () => {
  it("rejects invalid owner", async () => {
    const result = await deleteComment("../bad", "web", 1, 100);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid input/i);
  });

  it("rejects non-positive commentId", async () => {
    const result = await deleteComment("acme", "web", 1, -5);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid input/i);
  });

  it("rejects zero commentId", async () => {
    const result = await deleteComment("acme", "web", 1, 0);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid input/i);
  });

  it("succeeds with valid input", async () => {
    removeCommentMock.mockResolvedValue(undefined);

    const result = await deleteComment("acme", "web", 1, 100);
    expect(result.success).toBe(true);
  });

  it("returns error when repo is not tracked", async () => {
    getRepoMock.mockReturnValueOnce(null);
    const result = await deleteComment("acme", "web", 1, 100);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not tracked/i);
  });

  it("returns formatted error on API failure", async () => {
    withAuthRetryMock.mockRejectedValueOnce(new Error("Forbidden"));
    const result = await deleteComment("acme", "web", 1, 100);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Forbidden");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @issuectl/web test -- --run lib/actions/comments.test.ts`
Expected: FAIL — `editComment` and `deleteComment` are not exported from `./comments.js`

- [ ] **Step 3: Implement the server actions**

Add to `packages/web/lib/actions/comments.ts`. First, update imports:

```ts
import {
  getDb,
  getRepo,
  getIssueContent,
  addComment as coreAddComment,
  editComment as coreEditComment,
  removeComment as coreRemoveComment,
  withAuthRetry,
  withIdempotency,
  DuplicateInFlightError,
  formatErrorForUser,
} from "@issuectl/core";
```

Then add the validation regex and new actions after the existing `addComment` function:

```ts
const OWNER_REPO_RE = /^[a-zA-Z0-9_.-]+$/;

export async function editComment(
  owner: string,
  repo: string,
  issueNumber: number,
  commentId: number,
  body: string,
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  if (
    !owner || !repo ||
    !OWNER_REPO_RE.test(owner) || !OWNER_REPO_RE.test(repo) ||
    issueNumber <= 0 || commentId <= 0 ||
    !body.trim()
  ) {
    return { success: false, error: "Invalid input" };
  }
  if (body.length > MAX_COMMENT_BODY) {
    return {
      success: false,
      error: `Comment must be ${MAX_COMMENT_BODY} characters or fewer`,
    };
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return { success: false, error: "Repository is not tracked" };
    }
    await withAuthRetry((octokit) =>
      coreEditComment(db, octokit, owner, repo, issueNumber, commentId, body),
    );
  } catch (err) {
    console.error("[issuectl] Failed to edit comment:", err);
    return { success: false, error: formatErrorForUser(err) };
  }
  const { stale } = revalidateSafely(
    `/issues/${owner}/${repo}/${issueNumber}`,
    `/pulls/${owner}/${repo}/${issueNumber}`,
  );
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}

export async function deleteComment(
  owner: string,
  repo: string,
  issueNumber: number,
  commentId: number,
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  if (
    !owner || !repo ||
    !OWNER_REPO_RE.test(owner) || !OWNER_REPO_RE.test(repo) ||
    issueNumber <= 0 || commentId <= 0
  ) {
    return { success: false, error: "Invalid input" };
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return { success: false, error: "Repository is not tracked" };
    }
    await withAuthRetry((octokit) =>
      coreRemoveComment(db, octokit, owner, repo, issueNumber, commentId),
    );
  } catch (err) {
    console.error("[issuectl] Failed to delete comment:", err);
    return { success: false, error: formatErrorForUser(err) };
  }
  const { stale } = revalidateSafely(
    `/issues/${owner}/${repo}/${issueNumber}`,
    `/pulls/${owner}/${repo}/${issueNumber}`,
  );
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @issuectl/web test -- --run lib/actions/comments.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Type-check**

Run: `pnpm turbo typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web/lib/actions/comments.ts packages/web/lib/actions/comments.test.ts
git commit -m "feat(web): add editComment and deleteComment server actions"
```

---

### Task 6: UI — `CommentItem` component

**Files:**
- Create: `packages/web/components/detail/CommentItem.tsx`
- Create: `packages/web/components/detail/CommentItem.module.css`

- [ ] **Step 1: Create `CommentItem.module.css`**

Create `packages/web/components/detail/CommentItem.module.css`:

```css
.comment {
  padding-bottom: 18px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--paper-line-soft);
  position: relative;
}

.comment:last-child {
  border-bottom: none;
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.avi {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--paper-bg-warmer);
  border: 1px solid var(--paper-line);
  font-family: var(--paper-serif);
  font-weight: 600;
  font-style: italic;
  font-size: 11px;
  color: var(--paper-ink-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.avi img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.who {
  font-family: var(--paper-serif);
  font-weight: 500;
  font-size: 13px;
  color: var(--paper-ink);
}

.time {
  font-family: var(--paper-sans);
  font-size: 11px;
  color: var(--paper-ink-faint);
  margin-left: auto;
}

.commentBody {
  font-size: var(--paper-fs-md);
}

/* --- Action buttons --- */

.actions {
  display: inline-flex;
  gap: 6px;
  margin-left: 8px;
}

.actionBtn {
  background: none;
  border: none;
  padding: 2px 6px;
  cursor: pointer;
  font-family: var(--paper-sans);
  font-size: 11px;
  color: var(--paper-ink-faint);
  border-radius: var(--paper-radius-sm, 3px);
  transition: color 0.15s, background 0.15s;
}

.actionBtn:hover {
  color: var(--paper-ink-soft);
  background: var(--paper-bg-warmer);
}

.deleteConfirm {
  color: var(--paper-brick);
}

.deleteConfirm:hover {
  color: #fff;
  background: var(--paper-brick);
}

/* Desktop: hide actions until hover */
@media (min-width: 768px) {
  .actions {
    opacity: 0;
    transition: opacity 0.15s;
  }

  .comment:hover .actions {
    opacity: 1;
  }
}

/* --- Edit mode --- */

.editTextarea {
  width: 100%;
  font-family: var(--paper-serif);
  font-size: 16px;
  line-height: 1.55;
  color: var(--paper-ink-soft);
  background: var(--paper-bg-warm);
  border: 1px solid var(--paper-line);
  border-radius: var(--paper-radius-md);
  padding: 12px 14px;
  resize: vertical;
  min-height: 80px;
  outline: none;
  transition: border-color 0.15s;
}

.editTextarea:focus {
  border-color: var(--paper-accent-dim);
  background: var(--paper-bg);
}

.editFooter {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

.editHint {
  font-family: var(--paper-sans);
  font-size: var(--paper-fs-xs);
  color: var(--paper-ink-faint);
  margin-right: auto;
}

.cancelBtn {
  background: none;
  border: 1px solid var(--paper-line);
  padding: 4px 12px;
  cursor: pointer;
  font-family: var(--paper-sans);
  font-size: var(--paper-fs-sm);
  color: var(--paper-ink-soft);
  border-radius: var(--paper-radius-md);
}

.cancelBtn:hover {
  background: var(--paper-bg-warmer);
}

.hidden {
  display: none;
}

@media (max-width: 767px) {
  .editHint {
    display: none;
  }
}
```

- [ ] **Step 2: Create `CommentItem.tsx`**

Create `packages/web/components/detail/CommentItem.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { GitHubComment } from "@issuectl/core";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/paper";
import { LightboxBodyText } from "./LightboxBodyText";
import { editComment, deleteComment } from "@/lib/actions/comments";
import { timeAgo } from "@/lib/format";
import styles from "./CommentItem.module.css";

type Props = {
  comment: GitHubComment;
  currentUser: string | null;
  owner: string;
  repo: string;
  issueNumber: number;
};

function initials(login: string | undefined): string {
  if (!login) return "??";
  return login.slice(0, 2).toLowerCase();
}

const DELETE_CONFIRM_MS = 3000;

export function CommentItem({ comment, currentUser, owner, repo, issueNumber }: Props) {
  const router = useRouter();
  const { showToast } = useToast();

  const [mode, setMode] = useState<"normal" | "editing">("normal");
  const [editBody, setEditBody] = useState(comment.body);
  const [saving, setSaving] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwn = currentUser !== null && comment.user?.login === currentUser;

  // Clean up confirm timer on unmount
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleEdit = () => {
    setEditBody(comment.body);
    setMode("editing");
  };

  const handleCancelEdit = () => {
    setMode("normal");
  };

  const handleSaveEdit = async () => {
    if (saving || !editBody.trim()) return;
    setSaving(true);
    const originalBody = comment.body;

    // Optimistic: switch back to normal mode with new body
    comment.body = editBody;
    setMode("normal");

    const result = await editComment(owner, repo, issueNumber, comment.id, editBody);
    setSaving(false);

    if (!result.success) {
      // Rollback
      comment.body = originalBody;
      setMode("editing");
      showToast(result.error ?? "Failed to edit comment", "error");
      return;
    }

    router.refresh();
    showToast("Comment updated", "success");
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSaveEdit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  const handleDeleteClick = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmingDelete(false);
      }, DELETE_CONFIRM_MS);
      return;
    }

    // Confirmed — delete
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmingDelete(false);
    setDeleted(true);

    void (async () => {
      const result = await deleteComment(owner, repo, issueNumber, comment.id);
      if (!result.success) {
        setDeleted(false);
        showToast(result.error ?? "Failed to delete comment", "error");
        return;
      }
      router.refresh();
      showToast("Comment deleted", "success");
    })();
  };

  if (deleted) return null;

  return (
    <div className={styles.comment}>
      <div className={styles.head}>
        <div className={styles.avi}>
          {comment.user?.avatarUrl ? (
            <Image src={comment.user.avatarUrl} alt="" width={26} height={26} />
          ) : (
            initials(comment.user?.login)
          )}
        </div>
        <div className={styles.who}>{comment.user?.login ?? "unknown"}</div>
        {isOwn && mode === "normal" && (
          <div className={styles.actions}>
            <button type="button" className={styles.actionBtn} onClick={handleEdit}>
              edit
            </button>
            <button
              type="button"
              className={`${styles.actionBtn} ${confirmingDelete ? styles.deleteConfirm : ""}`}
              onClick={handleDeleteClick}
            >
              {confirmingDelete ? "confirm?" : "delete"}
            </button>
          </div>
        )}
        <div className={styles.time}>{timeAgo(comment.updatedAt)}</div>
      </div>

      {mode === "editing" ? (
        <>
          <textarea
            className={styles.editTextarea}
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            onKeyDown={handleEditKeyDown}
            rows={4}
            disabled={saving}
            maxLength={65536}
            autoFocus
          />
          <div className={styles.editFooter}>
            <span className={styles.editHint}>⌘↩ to save · esc to cancel</span>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={handleCancelEdit}
              disabled={saving}
            >
              cancel
            </button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveEdit}
              disabled={saving || !editBody.trim()}
            >
              {saving ? "saving…" : "save"}
            </Button>
          </div>
        </>
      ) : (
        <LightboxBodyText body={comment.body} className={styles.commentBody} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm turbo typecheck`
Expected: PASS (the component isn't used yet, but it should compile)

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/detail/CommentItem.tsx packages/web/components/detail/CommentItem.module.css
git commit -m "feat(web): add CommentItem component with inline edit and timed delete"
```

---

### Task 7: UI — Refactor `CommentList` and `CommentSection`

**Files:**
- Modify: `packages/web/components/detail/CommentList.tsx`
- Modify: `packages/web/components/detail/CommentList.module.css`
- Modify: `packages/web/components/detail/CommentSection.tsx`

- [ ] **Step 1: Refactor `CommentList` to use `CommentItem`**

Replace `packages/web/components/detail/CommentList.tsx`:

```tsx
import type { GitHubComment } from "@issuectl/core";
import { CommentItem } from "./CommentItem";
import styles from "./CommentList.module.css";

type Props = {
  comments: GitHubComment[];
  currentUser: string | null;
  owner: string;
  repo: string;
  issueNumber: number;
};

export function CommentList({ comments, currentUser, owner, repo, issueNumber }: Props) {
  return (
    <>
      <h2 className={styles.section}>
        comments <span className={styles.count}>{comments.length}</span>
      </h2>
      {comments.length === 0 ? (
        <div className={styles.empty}>
          <em>no comments yet</em>
        </div>
      ) : (
        comments.map((c) => (
          <CommentItem
            key={c.id}
            comment={c}
            currentUser={currentUser}
            owner={owner}
            repo={repo}
            issueNumber={issueNumber}
          />
        ))
      )}
    </>
  );
}
```

- [ ] **Step 2: Remove comment-level styles from `CommentList.module.css`**

Keep only the section-level styles. The comment-level styles (`.comment`, `.head`, `.avi`, `.who`, `.time`, `.commentBody`) now live in `CommentItem.module.css`.

Replace `packages/web/components/detail/CommentList.module.css`:

```css
.section {
  font-family: var(--paper-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 14px;
  color: var(--paper-ink-soft);
  padding: 10px 0 12px;
  border-top: 1px solid var(--paper-line);
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 14px;
}

.count {
  font-family: var(--paper-mono);
  font-size: 11px;
  color: var(--paper-ink-faint);
  font-style: normal;
}

.empty {
  font-family: var(--paper-serif);
  font-style: italic;
  font-size: 13px;
  color: var(--paper-ink-faint);
  margin-bottom: 20px;
}
```

- [ ] **Step 3: Update `CommentSection` to accept and pass `currentUser`**

Replace `packages/web/components/detail/CommentSection.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import type { GitHubComment } from "@issuectl/core";
import { CommentList } from "./CommentList";
import { CommentComposer } from "./CommentComposer";

type Props = {
  initialComments: GitHubComment[];
  currentUser: string | null;
  owner: string;
  repo: string;
  issueNumber: number;
};

export function CommentSection({ initialComments, currentUser, owner, repo, issueNumber }: Props) {
  const [pendingComments, setPendingComments] = useState<GitHubComment[]>([]);
  const prevCountRef = useRef(initialComments.length);

  // When server-rendered comments update (e.g. from router.refresh()),
  // clear pending optimistic comments — the server data is authoritative.
  useEffect(() => {
    if (initialComments.length > prevCountRef.current) {
      setPendingComments([]);
    }
    prevCountRef.current = initialComments.length;
  }, [initialComments.length]);

  const allComments = [...initialComments, ...pendingComments];

  const handleCommentPosted = (body: string) => {
    const optimistic: GitHubComment = {
      id: -Date.now(),
      body,
      user: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      htmlUrl: "",
    };
    setPendingComments((prev) => [...prev, optimistic]);
  };

  return (
    <>
      <CommentList
        comments={allComments}
        currentUser={currentUser}
        owner={owner}
        repo={repo}
        issueNumber={issueNumber}
      />
      <CommentComposer
        owner={owner}
        repo={repo}
        issueNumber={issueNumber}
        onCommentPosted={handleCommentPosted}
      />
    </>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm turbo typecheck`
Expected: FAIL — `IssueDetailContent` passes props to `CommentSection` without `currentUser`. This is expected and will be fixed in Task 8.

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/detail/CommentList.tsx packages/web/components/detail/CommentList.module.css packages/web/components/detail/CommentSection.tsx
git commit -m "refactor(web): extract CommentItem, thread currentUser through CommentList/Section"
```

---

### Task 8: Detail page integration — fetch and pass `currentUser`

**Files:**
- Modify: `packages/web/components/detail/IssueDetailContent.tsx`

- [ ] **Step 1: Update `IssueDetailContent` to fetch and pass `currentUser`**

Replace `packages/web/components/detail/IssueDetailContent.tsx`:

```tsx
import { getDb, getOctokit, getIssueContent, getCurrentUserLogin } from "@issuectl/core";
import type { Deployment, GitHubIssue } from "@issuectl/core";
import { LaunchCard } from "./LaunchCard";
import { CommentSection } from "./CommentSection";
import styles from "./IssueDetail.module.css";

type Props = {
  owner: string;
  repoName: string;
  issue: GitHubIssue;
  deployments: Deployment[];
};

/**
 * Streaming content section: calls getIssueContent to fetch comments,
 * then renders the LaunchCard (active deployment banner) and the
 * CommentSection (comment list + composer with optimistic updates).
 * Wrapped in Suspense by the page.
 *
 * Handles errors inline so a transient failure in getIssueContent
 * shows a degraded state instead of tearing down the whole page via the
 * root error boundary.
 */
export async function IssueDetailContent({
  owner,
  repoName,
  issue,
  deployments,
}: Props) {
  let comments;
  let currentUser: string | null = null;
  try {
    const db = getDb();
    const octokit = await getOctokit();
    const [result, login] = await Promise.all([
      getIssueContent(db, octokit, owner, repoName, issue.number),
      getCurrentUserLogin(db, octokit).catch((err) => {
        console.warn("[issuectl] Failed to fetch current user:", err);
        return null;
      }),
    ]);
    comments = result.comments;
    currentUser = login;
  } catch (err) {
    console.error(
      `[issuectl] IssueDetailContent: failed to load comments for ${owner}/${repoName}#${issue.number}`,
      err,
    );
    return (
      <>
        <LaunchCard
          owner={owner}
          repo={repoName}
          issueNumber={issue.number}
          issueTitle={issue.title}
          deployments={deployments}
        />
        <div className={styles.contentError} role="alert">
          Could not load comments. Refresh to try again.
        </div>
      </>
    );
  }

  return (
    <>
      <LaunchCard
        owner={owner}
        repo={repoName}
        issueNumber={issue.number}
        issueTitle={issue.title}
        deployments={deployments}
      />
      <CommentSection
        initialComments={comments}
        currentUser={currentUser}
        owner={owner}
        repo={repoName}
        issueNumber={issue.number}
      />
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm turbo typecheck`
Expected: PASS — all components now have matching prop types

- [ ] **Step 3: Run all tests**

Run: `pnpm turbo test`
Expected: All tests PASS

- [ ] **Step 4: Build**

Run: `pnpm turbo build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/detail/IssueDetailContent.tsx
git commit -m "feat(web): fetch currentUser and enable comment edit/delete on detail page"
```

---

### Task 9: Manual testing and final verification

- [ ] **Step 1: Start the dev server**

Run: `pnpm turbo dev`

- [ ] **Step 2: Test in browser**

Using Playwright CLI, verify:

1. Navigate to an issue detail page with comments
2. Own comments show edit/delete buttons (on hover on desktop)
3. Other users' comments do NOT show edit/delete buttons
4. Click "edit" → textarea appears with raw markdown, save/cancel buttons visible
5. Modify text and click "save" → comment updates, toast shows "Comment updated"
6. Click "edit" → press Escape → returns to normal mode without saving
7. Click "delete" → button changes to "confirm?" in red
8. Wait 3 seconds → button reverts to "delete"
9. Click "delete" → click "confirm?" → comment disappears, toast shows "Comment deleted"
10. Verify changes appear on GitHub

- [ ] **Step 3: Run full test suite**

Run: `pnpm turbo test`
Run: `pnpm turbo typecheck`
Expected: All PASS

- [ ] **Step 4: Commit any final adjustments**

If manual testing required tweaks, commit them.
