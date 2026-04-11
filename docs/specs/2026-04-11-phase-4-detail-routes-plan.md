# Paper Reskin Phase 4 Implementation Plan — Detail Routes

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the rows in the Phase 3 main list clickable. Adds three detail routes — `/issues/[owner]/[repo]/[number]`, `/pulls/[owner]/[repo]/[number]`, and `/drafts/[draftId]` — each rendering a read-only Paper-styled detail view. Wires `ListRow` to navigate to the appropriate route.

**Architecture:** Three new Server Component pages, one per route, each calling the existing data functions (`getIssueDetail`, `getPullDetail`, `getDraft`) and passing the result to a client-safe detail view component. Detail views compose several new shared primitives (top bar, meta row, comment list, body text) plus flow-specific components (launch card placeholder, CI checks, files changed). `ListRow` becomes an anchor that wraps its existing content in a `<Link>`.

**Tech Stack:** No new dependencies. Uses the Phase 1–3 foundation (Paper primitives + data layer). All new components are CSS Modules; no component tests per the existing web package convention.

**Scope:** Phase 4 of the 8-phase rollout. In scope: three detail routes + their view components + navigation wiring. **Out of scope and explicitly deferred:**

- **Comment composer** — adding a new comment. Detail shows the thread read-only. Phase 5 or later wires the composer + `addComment` server action.
- **Launch button wiring** — Phase 5. The launch card renders with a disabled button.
- **PR merge button** — Phase 5. Same treatment.
- **Edit issue / close issue / label editing** — later phase. Detail shows current state only.
- **Markdown rendering** — v1 renders the body as preformatted text (`<pre>` with paper styling) so URLs, code blocks, and line breaks are preserved. A real markdown renderer (e.g., `react-markdown`) comes later.
- **Assign sheet / reassign** — Phase 7.
- **Priority picker** — Phase 7.
- **Draft editing** — Phase 3.1 or later. The draft detail is read-only in v1.

---

## Prerequisites

- [ ] Clean working tree on the `issue-32-phase-4-detail-routes` worktree
- [ ] `pnpm turbo typecheck` passes baseline
- [ ] `pnpm -F @issuectl/core test` shows 183/183 passing
- [ ] `pnpm turbo build` passes baseline

Read before starting:

1. `docs/specs/2026-04-10-todo-reskin-design.md` — overall spec
2. `docs/mockups/paper-reskin.html#flow2` — issue detail mockup
3. `docs/mockups/paper-reskin.html#flow8` — PR detail mockup
4. `packages/core/src/data/issues.ts` — `getIssueDetail` return shape
5. `packages/core/src/data/pulls.ts` — `getPullDetail` return shape
6. `packages/core/src/github/types.ts` — `GitHubIssue`, `GitHubPull`, `GitHubComment`, `GitHubCheck`, `GitHubPullFile`, `GitHubUser`, `GitHubLabel`
7. `packages/core/src/db/drafts.ts` — `getDraft` already returns `Draft | undefined`
8. `packages/web/components/list/ListRow.tsx` — the row that will be wrapped in `<Link>` in Task 4.12

---

## Tasks

Twelve tasks plus a final verification. No core changes in Phase 4 — all work is in `packages/web/`.

---

### Task 4.1: Shared primitive — `DetailTopBar`

**Files:**
- Create: `packages/web/components/detail/DetailTopBar.tsx`
- Create: `packages/web/components/detail/DetailTopBar.module.css`

Back link + optional breadcrumb + optional trailing menu slot. Used by all three detail views.

- [ ] **Step 1: Create `DetailTopBar.module.css`**:

```css
.bar {
  padding: 52px 16px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--paper-line);
}

.back {
  font-family: var(--paper-serif);
  font-size: 22px;
  color: var(--paper-ink);
  text-decoration: none;
  padding: 4px 10px;
  border-radius: var(--paper-radius-sm);
  line-height: 1;
}

.back:hover {
  background: var(--paper-bg-warm);
}

.crumb {
  flex: 1;
  font-family: var(--paper-serif);
  font-style: italic;
  font-size: 13px;
  color: var(--paper-ink-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.crumb b {
  color: var(--paper-ink-soft);
  font-style: normal;
}

.menu {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--paper-ink-muted);
  letter-spacing: 2px;
}

@media (min-width: 768px) {
  .bar {
    padding: 36px 40px 20px;
    max-width: 820px;
    margin: 0 auto;
  }
}
```

- [ ] **Step 2: Create `DetailTopBar.tsx`**:

```typescript
import type { ReactNode } from "react";
import Link from "next/link";
import styles from "./DetailTopBar.module.css";

type Props = {
  backHref?: string;
  crumb?: ReactNode;
  menu?: ReactNode;
};

export function DetailTopBar({
  backHref = "/",
  crumb,
  menu,
}: Props) {
  return (
    <div className={styles.bar}>
      <Link href={backHref} className={styles.back} aria-label="Back">
        ‹
      </Link>
      {crumb && <div className={styles.crumb}>{crumb}</div>}
      {menu && <div className={styles.menu}>{menu}</div>}
    </div>
  );
}
```

- [ ] **Step 3:** Run typecheck. `pnpm -F @issuectl/web typecheck`. Expected: zero errors.

- [ ] **Step 4:** Commit. `feat(web): add DetailTopBar primitive`

---

### Task 4.2: Shared primitive — `DetailMeta`

**Files:**
- Create: `packages/web/components/detail/DetailMeta.tsx`
- Create: `packages/web/components/detail/DetailMeta.module.css`

The meta row underneath the title — renders children (chips, dates, state badges) in a flex row. This is a dumb container; callers pass in the actual chips.

- [ ] **Step 1: Create `DetailMeta.module.css`**:

```css
.meta {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  font-family: var(--paper-sans);
  font-size: 11.5px;
  color: var(--paper-ink-muted);
  margin-bottom: 22px;
}

.num {
  font-family: var(--paper-mono);
  color: var(--paper-ink-faint);
}

.sep {
  color: var(--paper-ink-faint);
}

.state {
  font-family: var(--paper-mono);
  font-size: 10.5px;
  padding: 2px 8px;
  border-radius: var(--paper-radius-sm);
  font-weight: 600;
  letter-spacing: 0.3px;
}

.state.open {
  background: var(--paper-accent-soft);
  color: var(--paper-accent);
}

.state.closed {
  background: var(--paper-bg-warmer);
  color: var(--paper-ink-muted);
}

.state.merged {
  background: rgba(138, 109, 181, 0.15);
  color: #5b4285;
}
```

- [ ] **Step 2: Create `DetailMeta.tsx`**:

```typescript
import type { ReactNode } from "react";
import styles from "./DetailMeta.module.css";

type Props = {
  children: ReactNode;
};

export function DetailMeta({ children }: Props) {
  return <div className={styles.meta}>{children}</div>;
}

type StateChipProps = {
  state: "open" | "closed" | "merged";
};

export function StateChip({ state }: StateChipProps) {
  return <span className={`${styles.state} ${styles[state]}`}>{state}</span>;
}

export function MetaSeparator() {
  return <span className={styles.sep}>·</span>;
}

export function MetaNum({ children }: { children: ReactNode }) {
  return <span className={styles.num}>{children}</span>;
}
```

- [ ] **Step 3:** Run typecheck. Expected: zero errors.

- [ ] **Step 4:** Commit. `feat(web): add DetailMeta primitives`

---

### Task 4.3: `BodyText` component

**Files:**
- Create: `packages/web/components/detail/BodyText.tsx`
- Create: `packages/web/components/detail/BodyText.module.css`

Renders an issue/PR body. v1 uses a `<pre>`-styled block with `white-space: pre-wrap` so multi-line bodies and embedded code are preserved without a real markdown renderer. Paper serif, generous line height.

- [ ] **Step 1: Create `BodyText.module.css`**:

```css
.body {
  font-family: var(--paper-serif);
  font-weight: 400;
  font-size: 15.5px;
  line-height: 1.65;
  color: var(--paper-ink-soft);
  margin-bottom: 28px;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.empty {
  font-family: var(--paper-serif);
  font-style: italic;
  font-size: 13px;
  color: var(--paper-ink-faint);
  margin-bottom: 28px;
}
```

- [ ] **Step 2: Create `BodyText.tsx`**:

```typescript
import styles from "./BodyText.module.css";

type Props = {
  body: string | null | undefined;
};

export function BodyText({ body }: Props) {
  if (!body || body.trim().length === 0) {
    return (
      <div className={styles.empty}>
        <em>no description</em>
      </div>
    );
  }
  return <div className={styles.body}>{body}</div>;
}
```

- [ ] **Step 3:** Run typecheck.

- [ ] **Step 4:** Commit. `feat(web): add BodyText component`

---

### Task 4.4: `CommentList` + `Comment` components

**Files:**
- Create: `packages/web/components/detail/CommentList.tsx`
- Create: `packages/web/components/detail/CommentList.module.css`

Read-only thread of GitHub comments. Each comment has a small monogram avatar, author login, relative time, body.

- [ ] **Step 1: Create `CommentList.module.css`**:

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
  margin-bottom: 14px;
}

.count {
  font-family: var(--paper-mono);
  font-size: 10px;
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

.comment {
  padding-bottom: 18px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--paper-line-soft);
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

.body {
  font-family: var(--paper-serif);
  font-size: 14px;
  line-height: 1.55;
  color: var(--paper-ink-soft);
  white-space: pre-wrap;
  word-wrap: break-word;
}
```

- [ ] **Step 2: Create `CommentList.tsx`**:

```typescript
import type { GitHubComment } from "@issuectl/core";
import styles from "./CommentList.module.css";

type Props = {
  comments: GitHubComment[];
};

// "3 days ago" style — works for both ISO strings (GitHub) and unix
// seconds (local drafts, though drafts don't have comments in Phase 4).
function formatTime(updatedAt: string): string {
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return "";
  const diffMs = Date.now() - t;
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays < 1) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function initials(login: string | undefined): string {
  if (!login) return "??";
  return login.slice(0, 2).toLowerCase();
}

export function CommentList({ comments }: Props) {
  return (
    <>
      <div className={styles.section}>
        comments <span className={styles.count}>{comments.length}</span>
      </div>
      {comments.length === 0 ? (
        <div className={styles.empty}>
          <em>no comments yet</em>
        </div>
      ) : (
        comments.map((c) => (
          <div key={c.id} className={styles.comment}>
            <div className={styles.head}>
              <div className={styles.avi}>
                {c.user?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.user.avatarUrl} alt="" />
                ) : (
                  initials(c.user?.login)
                )}
              </div>
              <div className={styles.who}>{c.user?.login ?? "unknown"}</div>
              <div className={styles.time}>{formatTime(c.updatedAt)}</div>
            </div>
            <div className={styles.body}>{c.body}</div>
          </div>
        ))
      )}
    </>
  );
}
```

**Note:** the `<img>` tag triggers a Next.js lint rule about using `next/image`. The suppression comment is deliberate — GitHub avatar URLs are remote and don't need Next.js's image optimization for tiny 26px avatars. Keep the disable comment.

- [ ] **Step 3:** Run typecheck.

- [ ] **Step 4:** Commit. `feat(web): add CommentList + Comment components`

---

### Task 4.5: `LaunchCardPlaceholder` component

**Files:**
- Create: `packages/web/components/detail/LaunchCardPlaceholder.tsx`
- Create: `packages/web/components/detail/LaunchCardPlaceholder.module.css`

Renders the launch card from the mockup with the forest-green left bar, heading, body copy, and a disabled "launch →" button. Phase 5 replaces this with a real interactive launch card.

- [ ] **Step 1: Create `LaunchCardPlaceholder.module.css`**:

```css
.card {
  background: var(--paper-bg-warm);
  border: 1px solid var(--paper-line);
  border-radius: var(--paper-radius-lg);
  padding: 18px 20px;
  margin-bottom: 28px;
  position: relative;
}

.card::before {
  content: "";
  position: absolute;
  left: 0;
  top: 14px;
  bottom: 14px;
  width: 3px;
  background: var(--paper-accent);
  border-radius: 2px;
}

.card h4 {
  font-family: var(--paper-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 15px;
  color: var(--paper-ink);
  margin-bottom: 4px;
}

.card p {
  font-family: var(--paper-serif);
  font-size: 12.5px;
  color: var(--paper-ink-muted);
  margin-bottom: 14px;
  line-height: 1.5;
}

.actions {
  display: flex;
  gap: 8px;
}

.disabled {
  background: var(--paper-accent);
  color: var(--paper-bg);
  font-family: var(--paper-serif);
  font-style: italic;
  font-weight: 600;
  font-size: 13px;
  padding: 9px 18px;
  border-radius: var(--paper-radius-md);
  border: none;
  flex: 1;
  cursor: not-allowed;
  opacity: 0.6;
}

.hint {
  font-family: var(--paper-serif);
  font-style: italic;
  font-size: 11px;
  color: var(--paper-ink-faint);
  margin-top: 8px;
}
```

- [ ] **Step 2: Create `LaunchCardPlaceholder.tsx`**:

```typescript
import styles from "./LaunchCardPlaceholder.module.css";

export function LaunchCardPlaceholder() {
  return (
    <div className={styles.card}>
      <h4>Ready to launch</h4>
      <p>
        Open a Ghostty session with Claude Code pre-loaded. Creates a worktree
        on a fresh branch.
      </p>
      <div className={styles.actions}>
        <button className={styles.disabled} disabled>
          launch →
        </button>
      </div>
      <div className={styles.hint}>wired up in Phase 5</div>
    </div>
  );
}
```

- [ ] **Step 3:** Run typecheck.

- [ ] **Step 4:** Commit. `feat(web): add LaunchCardPlaceholder component`

---

### Task 4.6: `IssueDetail` composition component

**Files:**
- Create: `packages/web/components/detail/IssueDetail.tsx`
- Create: `packages/web/components/detail/IssueDetail.module.css`

Ties the pieces together for the issue detail view. Stateless — just a composition of the shared primitives + a body + comments.

- [ ] **Step 1: Create `IssueDetail.module.css`**:

```css
.container {
  background: var(--paper-bg);
  min-height: 100vh;
  padding-bottom: 60px;
}

.body {
  padding: 22px 24px 60px;
}

.title {
  font-family: var(--paper-serif);
  font-weight: 500;
  font-size: 26px;
  line-height: 1.2;
  letter-spacing: -0.4px;
  color: var(--paper-ink);
  margin-bottom: 12px;
}

@media (min-width: 768px) {
  .body {
    max-width: 820px;
    margin: 0 auto;
    padding: 32px 40px 40px;
  }

  .title {
    font-size: 36px;
    line-height: 1.15;
    letter-spacing: -0.7px;
    margin-bottom: 14px;
  }
}
```

- [ ] **Step 2: Create `IssueDetail.tsx`**:

```typescript
import type { Deployment } from "@issuectl/core";
import type {
  GitHubIssue,
  GitHubComment,
  GitHubPull,
} from "@issuectl/core";
import { Chip } from "@/components/paper";
import { DetailTopBar } from "./DetailTopBar";
import {
  DetailMeta,
  StateChip,
  MetaSeparator,
  MetaNum,
} from "./DetailMeta";
import { BodyText } from "./BodyText";
import { CommentList } from "./CommentList";
import { LaunchCardPlaceholder } from "./LaunchCardPlaceholder";
import styles from "./IssueDetail.module.css";

type Props = {
  owner: string;
  repoName: string;
  issue: GitHubIssue;
  comments: GitHubComment[];
  deployments: Deployment[];
  linkedPRs: GitHubPull[];
};

function formatAge(updatedAt: string): string {
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return "";
  const diffDays = Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
  if (diffDays < 1) return "today";
  if (diffDays === 1) return "1d old";
  return `${diffDays}d old`;
}

export function IssueDetail({
  owner,
  repoName,
  issue,
  comments,
  deployments: _deployments,
  linkedPRs: _linkedPRs,
}: Props) {
  const displayLabels = issue.labels.filter(
    (l) => !l.name.startsWith("issuectl:"),
  );

  return (
    <div className={styles.container}>
      <DetailTopBar
        backHref="/"
        crumb={
          <>
            {owner}/<b>{repoName}</b>
          </>
        }
        menu="···"
      />
      <div className={styles.body}>
        <h1 className={styles.title}>{issue.title}</h1>
        <DetailMeta>
          <Chip>{repoName}</Chip>
          <MetaNum>#{issue.number}</MetaNum>
          <MetaSeparator />
          <StateChip state={issue.state} />
          {displayLabels.length > 0 && (
            <>
              <MetaSeparator />
              {displayLabels.slice(0, 3).map((l) => (
                <span key={l.name}>{l.name}</span>
              ))}
            </>
          )}
          <MetaSeparator />
          <span>{formatAge(issue.updatedAt)}</span>
        </DetailMeta>

        <LaunchCardPlaceholder />
        <BodyText body={issue.body} />
        <CommentList comments={comments} />
      </div>
    </div>
  );
}
```

The underscored `_deployments` and `_linkedPRs` props are intentionally unused in Phase 4 — Phase 5 wires them into the launch card (to show worktree state) and a linked-PR indicator. Keeping them in the prop type now means Phase 5 doesn't need a breaking change to the call site.

- [ ] **Step 3:** Run typecheck.

- [ ] **Step 4:** Commit. `feat(web): add IssueDetail composition`

---

### Task 4.7: `CIChecks` component (PR-specific)

**Files:**
- Create: `packages/web/components/detail/CIChecks.tsx`
- Create: `packages/web/components/detail/CIChecks.module.css`

Renders the CI check list on a PR detail page. Shows each check's name, conclusion (pass/fail/pending/skipped), and status.

- [ ] **Step 1: Create `CIChecks.module.css`**:

```css
.wrapper {
  margin: 0 0 24px;
  background: var(--paper-bg-warm);
  border: 1px solid var(--paper-line);
  border-radius: var(--paper-radius-md);
  padding: 4px 14px;
}

.check {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--paper-line-soft);
  font-family: var(--paper-serif);
  font-size: 12.5px;
  color: var(--paper-ink-soft);
}

.check:last-child {
  border-bottom: none;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot.success {
  background: var(--paper-accent);
}

.dot.failure {
  background: var(--paper-brick);
}

.dot.pending {
  background: var(--paper-butter);
}

.dot.neutral {
  background: var(--paper-ink-faint);
}

.name {
  flex: 1;
}

.detail {
  font-family: var(--paper-sans);
  font-size: 10.5px;
  color: var(--paper-ink-faint);
}

.empty {
  font-family: var(--paper-serif);
  font-style: italic;
  font-size: 12px;
  color: var(--paper-ink-faint);
  padding: 12px 0;
  text-align: center;
}
```

- [ ] **Step 2: Create `CIChecks.tsx`**:

```typescript
import type { GitHubCheck } from "@issuectl/core";
import styles from "./CIChecks.module.css";

type Props = {
  checks: GitHubCheck[];
};

type DotKind = "success" | "failure" | "pending" | "neutral";

function dotKind(check: GitHubCheck): DotKind {
  if (check.status !== "completed") return "pending";
  if (check.conclusion === "success") return "success";
  if (check.conclusion === "failure" || check.conclusion === "timed_out")
    return "failure";
  return "neutral";
}

function detailText(check: GitHubCheck): string {
  if (check.status !== "completed") return check.status.replace("_", " ");
  return check.conclusion ?? "";
}

export function CIChecks({ checks }: Props) {
  if (checks.length === 0) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.empty}>
          <em>no CI checks reported</em>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.wrapper}>
      {checks.map((check, i) => (
        <div
          key={`${check.name}-${i}`}
          className={styles.check}
        >
          <div className={`${styles.dot} ${styles[dotKind(check)]}`} />
          <div className={styles.name}>{check.name}</div>
          <div className={styles.detail}>{detailText(check)}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3:** Run typecheck.

- [ ] **Step 4:** Commit. `feat(web): add CIChecks component`

---

### Task 4.8: `FilesChanged` component (PR-specific)

**Files:**
- Create: `packages/web/components/detail/FilesChanged.tsx`
- Create: `packages/web/components/detail/FilesChanged.module.css`

Lists the files changed in a PR with +additions and -deletions counts. Display only — no diff view.

- [ ] **Step 1: Create `FilesChanged.module.css`**:

```css
.wrapper {
  font-family: var(--paper-mono);
  font-size: 11px;
  color: var(--paper-ink-soft);
  line-height: 1.7;
  background: var(--paper-bg-warm);
  border: 1px solid var(--paper-line);
  border-radius: var(--paper-radius-md);
  padding: 12px 14px;
  margin-bottom: 20px;
}

.line {
  display: flex;
  gap: 12px;
  align-items: center;
}

.add {
  color: var(--paper-accent);
  font-family: var(--paper-serif);
  font-style: italic;
  font-size: 10px;
  font-weight: 600;
  min-width: 26px;
  text-align: right;
}

.del {
  color: var(--paper-brick);
  font-family: var(--paper-serif);
  font-style: italic;
  font-size: 10px;
  font-weight: 600;
  min-width: 26px;
  text-align: right;
}

.filename {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.removed .filename {
  text-decoration: line-through;
  color: var(--paper-ink-faint);
}

.empty {
  font-family: var(--paper-serif);
  font-style: italic;
  font-size: 12px;
  color: var(--paper-ink-faint);
  text-align: center;
}
```

- [ ] **Step 2: Create `FilesChanged.tsx`**:

```typescript
import type { GitHubPullFile } from "@issuectl/core";
import styles from "./FilesChanged.module.css";

type Props = {
  files: GitHubPullFile[];
};

export function FilesChanged({ files }: Props) {
  if (files.length === 0) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.empty}>
          <em>no files changed</em>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.wrapper}>
      {files.map((file) => (
        <div
          key={file.filename}
          className={`${styles.line} ${
            file.status === "removed" ? styles.removed : ""
          }`}
        >
          <span className={styles.add}>+{file.additions}</span>
          <span className={styles.del}>-{file.deletions}</span>
          <span className={styles.filename}>{file.filename}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3:** Run typecheck.

- [ ] **Step 4:** Commit. `feat(web): add FilesChanged component`

---

### Task 4.9: `PrDetail` composition

**Files:**
- Create: `packages/web/components/detail/PrDetail.tsx`
- Create: `packages/web/components/detail/PrDetail.module.css`

Composes PR-specific pieces + shared primitives into a PR detail view.

- [ ] **Step 1: Create `PrDetail.module.css`**:

```css
.container {
  background: var(--paper-bg);
  min-height: 100vh;
  padding-bottom: 60px;
}

.body {
  padding: 22px 24px 60px;
}

.title {
  font-family: var(--paper-serif);
  font-weight: 500;
  font-size: 26px;
  line-height: 1.2;
  letter-spacing: -0.4px;
  color: var(--paper-ink);
  margin-bottom: 12px;
}

.section {
  font-family: var(--paper-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 14px;
  color: var(--paper-ink-soft);
  padding: 10px 0 12px;
  border-top: 1px solid var(--paper-line);
  margin-bottom: 14px;
}

.mergeBtn {
  width: 100%;
  padding: 12px;
  background: var(--paper-accent);
  color: var(--paper-bg);
  border: none;
  border-radius: var(--paper-radius-md);
  font-family: var(--paper-serif);
  font-style: italic;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 20px;
  cursor: not-allowed;
  opacity: 0.6;
}

.hint {
  font-family: var(--paper-serif);
  font-style: italic;
  font-size: 11px;
  color: var(--paper-ink-faint);
  text-align: center;
  margin-top: -12px;
  margin-bottom: 20px;
}

@media (min-width: 768px) {
  .body {
    max-width: 820px;
    margin: 0 auto;
    padding: 32px 40px 40px;
  }

  .title {
    font-size: 36px;
    line-height: 1.15;
    letter-spacing: -0.7px;
  }
}
```

- [ ] **Step 2: Create `PrDetail.tsx`**:

```typescript
import type {
  GitHubPull,
  GitHubCheck,
  GitHubPullFile,
  GitHubIssue,
} from "@issuectl/core";
import { Chip } from "@/components/paper";
import { DetailTopBar } from "./DetailTopBar";
import {
  DetailMeta,
  StateChip,
  MetaSeparator,
  MetaNum,
} from "./DetailMeta";
import { BodyText } from "./BodyText";
import { CIChecks } from "./CIChecks";
import { FilesChanged } from "./FilesChanged";
import styles from "./PrDetail.module.css";

type Props = {
  owner: string;
  repoName: string;
  pull: GitHubPull;
  checks: GitHubCheck[];
  files: GitHubPullFile[];
  linkedIssue: GitHubIssue | null;
};

export function PrDetail({
  owner,
  repoName,
  pull,
  checks,
  files,
  linkedIssue,
}: Props) {
  const prState: "open" | "closed" | "merged" = pull.merged
    ? "merged"
    : pull.state;

  return (
    <div className={styles.container}>
      <DetailTopBar
        backHref="/?tab=prs"
        crumb={
          <>
            {owner}/<b>{repoName}</b>
          </>
        }
        menu="···"
      />
      <div className={styles.body}>
        <h1 className={styles.title}>{pull.title}</h1>
        <DetailMeta>
          <Chip>{repoName}</Chip>
          <MetaNum>#{pull.number}</MetaNum>
          <MetaSeparator />
          <StateChip state={prState} />
          {linkedIssue && (
            <>
              <MetaSeparator />
              <span>closes #{linkedIssue.number}</span>
            </>
          )}
          <MetaSeparator />
          <span>
            +{pull.additions} / −{pull.deletions} across {pull.changedFiles}{" "}
            files
          </span>
        </DetailMeta>

        {prState === "open" && (
          <>
            <button className={styles.mergeBtn} disabled>
              merge pull request →
            </button>
            <div className={styles.hint}>wired up in Phase 5</div>
          </>
        )}

        <div className={styles.section}>description</div>
        <BodyText body={pull.body} />

        <div className={styles.section}>ci checks</div>
        <CIChecks checks={checks} />

        <div className={styles.section}>files changed</div>
        <FilesChanged files={files} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3:** Run typecheck.

- [ ] **Step 4:** Commit. `feat(web): add PrDetail composition`

---

### Task 4.10: `DraftDetail` composition

**Files:**
- Create: `packages/web/components/detail/DraftDetail.tsx`
- Create: `packages/web/components/detail/DraftDetail.module.css`

Minimal read-only view of a local draft. Phase 3.1 or later adds editing. Phase 5 or later wires assignment.

- [ ] **Step 1: Create `DraftDetail.module.css`**:

```css
.container {
  background: var(--paper-bg);
  min-height: 100vh;
  padding-bottom: 60px;
}

.body {
  padding: 22px 24px 60px;
}

.title {
  font-family: var(--paper-serif);
  font-weight: 500;
  font-size: 26px;
  line-height: 1.2;
  letter-spacing: -0.4px;
  color: var(--paper-ink);
  margin-bottom: 12px;
}

.hint {
  font-family: var(--paper-serif);
  font-style: italic;
  font-size: 12.5px;
  color: var(--paper-ink-faint);
  padding: 14px 16px;
  background: var(--paper-bg-warm);
  border: 1px solid var(--paper-line);
  border-radius: var(--paper-radius-md);
  margin-bottom: 28px;
}

@media (min-width: 768px) {
  .body {
    max-width: 820px;
    margin: 0 auto;
    padding: 32px 40px 40px;
  }

  .title {
    font-size: 36px;
    line-height: 1.15;
    letter-spacing: -0.7px;
  }
}
```

- [ ] **Step 2: Create `DraftDetail.tsx`**:

```typescript
import type { Draft } from "@issuectl/core";
import { Chip } from "@/components/paper";
import { DetailTopBar } from "./DetailTopBar";
import { DetailMeta, MetaSeparator } from "./DetailMeta";
import { BodyText } from "./BodyText";
import styles from "./DraftDetail.module.css";

type Props = {
  draft: Draft;
};

function formatUnix(updatedAt: number): string {
  const t = updatedAt * 1000;
  const diffDays = Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
  if (diffDays < 1) return "today";
  if (diffDays === 1) return "1d old";
  return `${diffDays}d old`;
}

export function DraftDetail({ draft }: Props) {
  return (
    <div className={styles.container}>
      <DetailTopBar
        backHref="/"
        crumb={<em>draft</em>}
      />
      <div className={styles.body}>
        <h1 className={styles.title}>{draft.title}</h1>
        <DetailMeta>
          <Chip variant="dashed">no repo</Chip>
          <MetaSeparator />
          <span>priority: {draft.priority}</span>
          <MetaSeparator />
          <span>{formatUnix(draft.updatedAt)}</span>
        </DetailMeta>
        <div className={styles.hint}>
          this is a local draft — it lives only on your machine until you
          assign it to a repo.
        </div>
        <BodyText body={draft.body} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3:** Run typecheck.

- [ ] **Step 4:** Commit. `feat(web): add DraftDetail composition`

---

### Task 4.11: Add the three detail routes

**Files (3 new Server Component pages):**
- Create: `packages/web/app/issues/[owner]/[repo]/[number]/page.tsx`
- Create: `packages/web/app/pulls/[owner]/[repo]/[number]/page.tsx`
- Create: `packages/web/app/drafts/[draftId]/page.tsx`

All three are Server Components that fetch data and render the matching detail component. Uses `notFound()` from `next/navigation` when the requested entity isn't found.

- [ ] **Step 1: Create `packages/web/app/issues/[owner]/[repo]/[number]/page.tsx`**:

```typescript
import { notFound } from "next/navigation";
import { getDb, getOctokit, getIssueDetail } from "@issuectl/core";
import { IssueDetail } from "@/components/detail/IssueDetail";

export const dynamic = "force-dynamic";

type Params = {
  owner: string;
  repo: string;
  number: string;
};

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { owner, repo, number } = await params;
  const issueNumber = Number(number);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    notFound();
  }

  const db = getDb();
  const octokit = await getOctokit();

  try {
    const detail = await getIssueDetail(db, octokit, owner, repo, issueNumber);
    return (
      <IssueDetail
        owner={owner}
        repoName={repo}
        issue={detail.issue}
        comments={detail.comments}
        deployments={detail.deployments}
        linkedPRs={detail.linkedPRs}
      />
    );
  } catch (err) {
    console.error(
      `[issuectl] IssueDetailPage: failed to fetch ${owner}/${repo}#${issueNumber}`,
      err,
    );
    notFound();
  }
}
```

- [ ] **Step 2: Create `packages/web/app/pulls/[owner]/[repo]/[number]/page.tsx`**:

```typescript
import { notFound } from "next/navigation";
import { getDb, getOctokit, getPullDetail } from "@issuectl/core";
import { PrDetail } from "@/components/detail/PrDetail";

export const dynamic = "force-dynamic";

type Params = {
  owner: string;
  repo: string;
  number: string;
};

export default async function PullDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { owner, repo, number } = await params;
  const pullNumber = Number(number);
  if (!Number.isInteger(pullNumber) || pullNumber <= 0) {
    notFound();
  }

  const db = getDb();
  const octokit = await getOctokit();

  try {
    const detail = await getPullDetail(db, octokit, owner, repo, pullNumber);
    return (
      <PrDetail
        owner={owner}
        repoName={repo}
        pull={detail.pull}
        checks={detail.checks}
        files={detail.files}
        linkedIssue={detail.linkedIssue}
      />
    );
  } catch (err) {
    console.error(
      `[issuectl] PullDetailPage: failed to fetch ${owner}/${repo}#${pullNumber}`,
      err,
    );
    notFound();
  }
}
```

- [ ] **Step 3: Create `packages/web/app/drafts/[draftId]/page.tsx`**:

```typescript
import { notFound } from "next/navigation";
import { getDb, getDraft } from "@issuectl/core";
import { DraftDetail } from "@/components/detail/DraftDetail";

export const dynamic = "force-dynamic";

type Params = {
  draftId: string;
};

export default async function DraftDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { draftId } = await params;
  const db = getDb();
  const draft = getDraft(db, draftId);
  if (!draft) {
    notFound();
  }

  return <DraftDetail draft={draft} />;
}
```

- [ ] **Step 4:** Run the full build.
Run: `pnpm turbo build`
Expected: All 3 new routes appear in the Next.js build output (look for `/issues/...`, `/pulls/...`, `/drafts/...` in the route list).

- [ ] **Step 5:** Commit.
```bash
git add packages/web/app/issues packages/web/app/pulls packages/web/app/drafts
git commit -m "feat(web): add issue, PR, and draft detail routes"
```

---

### Task 4.12: Wire `ListRow` to navigate

**File:**
- Modify: `packages/web/components/list/ListRow.tsx`

The current `ListRow` renders a plain `<div>`. Wrap the row in a `<Link>` so clicking navigates to the appropriate detail route. Drafts → `/drafts/${id}`, issues → `/issues/${repo.owner}/${repo.name}/${issue.number}`.

- [ ] **Step 1:** Read the current `ListRow.tsx` and note the two render branches (draft vs issue).

- [ ] **Step 2:** Update the component to use `next/link`:

Add this import at the top:
```typescript
import Link from "next/link";
```

Find the `return` statement in the `draft` branch (currently wrapped in `<div className={styles.item}>`). Replace the wrapping `<div>` with `<Link>`:

Before:
```typescript
return (
  <div className={styles.item}>
    <span className={styles.check}>
      <Checkbox state="draft" />
    </span>
    <div className={styles.title}>{item.draft.title}</div>
    ...
  </div>
);
```

After:
```typescript
return (
  <Link href={`/drafts/${item.draft.id}`} className={styles.item}>
    <span className={styles.check}>
      <Checkbox state="draft" />
    </span>
    <div className={styles.title}>{item.draft.title}</div>
    ...
  </Link>
);
```

Similarly, replace the issue branch's wrapping `<div className={styles.item}>` with:

```typescript
<Link
  href={`/issues/${repo.owner}/${repo.name}/${issue.number}`}
  className={styles.item}
>
```

- [ ] **Step 3:** Confirm `ListRow.module.css` already has `.item { color: inherit; text-decoration: none; }` so anchors don't render as underlined links. (It does — verify.)

- [ ] **Step 4:** Run typecheck + build.
Run: `pnpm turbo typecheck && pnpm -F @issuectl/web build`
Expected: Both pass cleanly.

- [ ] **Step 5:** Commit.
```bash
git add packages/web/components/list/ListRow.tsx
git commit -m "feat(web): wire ListRow to navigate to detail routes"
```

---

### Task 4.13: Final monorepo verification

No new files — just a full-stack sanity check.

- [ ] **Step 1:** `pnpm turbo typecheck` — all 4 tasks pass.
- [ ] **Step 2:** `pnpm turbo build` — all 3 packages build; note the new routes in the Next.js build output.
- [ ] **Step 3:** `pnpm turbo lint` — zero warnings.
- [ ] **Step 4:** `pnpm -F @issuectl/core test` — 183/183 still passing.
- [ ] **Step 5:** Eyeball the dev server: clicking an issue row should navigate to `/issues/<owner>/<repo>/<number>` and show the Paper detail view. Clicking a draft row should navigate to `/drafts/<id>`. The launch/merge buttons are disabled (Phase 5 wires them).

No commit for this task — verification only.

---

## Self-Review Checklist

- [ ] **Spec coverage** — spec's Phase 4 item ("issue + PR detail routes") maps to Tasks 4.11 (routes) + 4.6, 4.9, 4.10 (view compositions).
- [ ] **Placeholders** — no "TBD" or "fill in details" anywhere.
- [ ] **Type consistency** — `GitHubIssue`, `GitHubPull`, `GitHubCheck`, `GitHubPullFile`, `GitHubComment`, `GitHubUser`, `GitHubLabel`, `Draft`, `Deployment` used consistently. All imported from `@issuectl/core` (they're re-exported by the core index).
- [ ] **Route structure** — the `[owner]/[repo]/[number]` nested route does NOT collide with the old `/[owner]/[repo]/...` routes that still live under `app/` from before Phase 3 (Phase 8 deletes them). The new routes are namespaced under `/issues/`, `/pulls/`, `/drafts/` to avoid any routing ambiguity.
- [ ] **Next.js params** — in Next.js 15 App Router, `params` is a Promise and must be awaited. All three routes await it correctly.
- [ ] **No classes**, ESM imports, Server Components for reads, CSS Modules per component — all project conventions honored.
