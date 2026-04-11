# Paper Reskin Phase 3 Implementation Plan — Main List

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing dashboard repo-grid with a cross-repo flat list that aggregates drafts + open/in-flight/shipped issues from every tracked repo, grouped into four sections and ordered by priority within each section. Ship with minimum viable draft creation and assign flows using the Phase 2 Paper primitives.

**Architecture:** A new `getUnifiedList` core function aggregates data across all tracked repos via parallel `getIssues` calls + `listDrafts` + deployment/priority lookups. A pure `groupIntoSections` helper assigns items into `unassigned | in focus | in flight | shipped` based on draft existence, deployment state (active row in `deployments` with `ended_at IS NULL`), and issue state (`closed` → shipped). Priority sort within each section is `priority DESC, updatedAt DESC`. The main list page is a Server Component that calls `getUnifiedList` and passes the result to a client-side `List` component that manages sheet state for the `CreateDraftSheet` and `AssignSheet` overlays.

**Tech Stack:** No new dependencies. Uses the Phase 1 data layer (`drafts`, `priority`, `getIssues`, `listRepos`, `getDeploymentsByRepo`) and the Phase 2 Paper primitives (`Chip`, `Button`, `Sheet`).

**Scope:** Phase 3 of the 8-phase rollout from `docs/specs/2026-04-10-todo-reskin-design.md`. In scope: main list data layer, list component tree, draft creation, assign-to-repo flow, row swipe gesture. **Out of scope and explicitly deferred:**

- **Tapping a row to open detail** — Phase 4 adds `/issues/[owner]/[repo]/[number]` routes. In Phase 3, row tap is a no-op.
- **Launch button wiring** — Phase 5 adds the launch progress view. In Phase 3, the hover-reveal `launch` button on desktop calls a placeholder server action that does nothing.
- **PR tab variant** — Phase 7. The `Pull requests` tab is rendered as disabled in Phase 3.
- **Mobile nav drawer** — Phase 7. The existing Sidebar stays in `layout.tsx` on desktop; mobile viewport just shows the new list without a drawer.
- **Priority picker sheet** — Phase 7. Drafts default to `normal`; no UI to change priority on existing issues yet.
- **Rich draft editing** — Phase 3 ships title-only draft creation. Body + repo assignment + labels are in Phase 3.1 or later.
- **Old `components/dashboard/` + `components/repo/` directories** — stay in place. Phase 8 deletes them once nothing references them.

---

## Prerequisites

- [ ] Clean working tree on `issue-32-phase-3-main-list` worktree: `git status` → nothing to commit
- [ ] `pnpm install` completes without errors
- [ ] `pnpm turbo typecheck` passes (baseline)
- [ ] `pnpm -F @issuectl/core test` shows **169/169 passing**
- [ ] `pnpm turbo build` passes

Read these before starting:

1. `docs/specs/2026-04-10-todo-reskin-design.md` — the overall spec
2. `docs/mockups/paper-reskin.html` — open in a browser, scroll to `#flow1` for the main list mockup reference
3. `packages/core/src/index.ts` — what's already exported (drafts CRUD, priority CRUD, getIssues, etc.)
4. `packages/core/src/data/issues.ts` — existing `getIssues` data function with the SWR cache pattern
5. `packages/core/src/data/repos.ts` — existing `getDashboardData` aggregator (the old pattern we're replacing)
6. `packages/core/src/db/drafts.ts` — `listDrafts`, `createDraft`, `assignDraftToRepo`
7. `packages/core/src/db/priority.ts` — `listPrioritiesForRepo`
8. `packages/core/src/db/deployments.ts` — `getDeploymentsByRepo` for in-flight detection
9. `packages/web/components/paper/` — Paper primitives (Chip, Button, Sheet, Drawer)
10. `packages/web/app/page.tsx` — the current dashboard page (to be replaced)

## Convention reminders

From `CLAUDE.md`:
- **ESM everywhere**, strict TypeScript, no classes.
- **Explicit DB parameter**, explicit Octokit parameter in core functions.
- **Server Components for reads, Server Actions for mutations.**
- **CSS Modules per component**, tokens in `app/globals.css`.
- **Tests alongside code** (`foo.test.ts` next to `foo.ts`).

---

## Phase 3 Tasks

Fourteen tasks. Core tasks follow TDD (test first, implement, verify pass, commit). Web tasks validate via typecheck + build; no component tests.

---

### Task 3.1: Add `Section` and `UnifiedListItem` types

**Files:**
- Modify: `packages/core/src/types.ts`

- [ ] **Step 1: Append the new types to the bottom of `types.ts`**

```typescript
export type Section = "unassigned" | "in_focus" | "in_flight" | "shipped";

// A UnifiedListItem is either a local draft (unassigned) or a
// GitHub-backed issue enriched with its local priority and its
// lifecycle state for the current section.
export type UnifiedListItem =
  | {
      kind: "draft";
      draft: Draft;
    }
  | {
      kind: "issue";
      repo: Repo;
      issue: GitHubIssue;
      priority: Priority;
      section: Exclude<Section, "unassigned">;
    };

export type UnifiedList = {
  unassigned: UnifiedListItem[];
  in_focus: UnifiedListItem[];
  in_flight: UnifiedListItem[];
  shipped: UnifiedListItem[];
};
```

- [ ] **Step 2: Add `GitHubIssue` import at the top of `types.ts`**

Find the existing imports (currently just `WorkspaceMode`). Add:

```typescript
import type { GitHubIssue } from "./github/types.js";
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm -F @issuectl/core typecheck`
Expected: Zero errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): add Section and UnifiedList types"
```

---

### Task 3.2: Implement `groupIntoSections` pure helper

**Files:**
- Create: `packages/core/src/data/unified-list.ts`
- Create: `packages/core/src/data/unified-list.test.ts`

- [ ] **Step 1: Write the failing test** at `packages/core/src/data/unified-list.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type {
  Draft,
  Repo,
  IssuePriority,
  Deployment,
} from "../types.js";
import type { GitHubIssue } from "../github/types.js";
import { groupIntoSections } from "./unified-list.js";

const repo: Repo = {
  id: 1,
  owner: "neonwatty",
  name: "api",
  localPath: null,
  branchPattern: null,
  createdAt: "2026-01-01",
};

function makeIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 1,
    title: "Test issue",
    body: "",
    state: "open",
    labels: [],
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    author: "neonwatty",
    comments: 0,
    ...overrides,
  };
}

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "draft-" + Math.random().toString(36).slice(2, 8),
    title: "Draft",
    body: "",
    priority: "normal",
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeDeployment(issueNumber: number, ended = false): Deployment {
  return {
    id: issueNumber * 10,
    repoId: repo.id,
    issueNumber,
    branchName: `issue-${issueNumber}`,
    workspaceMode: "worktree",
    workspacePath: `/tmp/${issueNumber}`,
    linkedPrNumber: null,
    launchedAt: "2026-04-01T00:00:00Z",
    endedAt: ended ? "2026-04-02T00:00:00Z" : null,
  };
}

describe("groupIntoSections", () => {
  it("puts drafts in the unassigned section", () => {
    const d1 = makeDraft({ title: "First" });
    const d2 = makeDraft({ title: "Second" });
    const result = groupIntoSections({
      drafts: [d1, d2],
      perRepo: [],
    });
    expect(result.unassigned).toHaveLength(2);
    expect(result.unassigned.every((item) => item.kind === "draft")).toBe(true);
    expect(result.in_focus).toEqual([]);
    expect(result.in_flight).toEqual([]);
    expect(result.shipped).toEqual([]);
  });

  it("puts closed issues in shipped", () => {
    const closed = makeIssue({ number: 1, state: "closed" });
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [closed],
          deployments: [],
          priorities: [],
        },
      ],
    });
    expect(result.shipped).toHaveLength(1);
    expect(result.in_focus).toEqual([]);
  });

  it("puts open issues with an active deployment in in_flight", () => {
    const issue = makeIssue({ number: 2 });
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [issue],
          deployments: [makeDeployment(2, false)], // active
          priorities: [],
        },
      ],
    });
    expect(result.in_flight).toHaveLength(1);
    expect(result.in_focus).toEqual([]);
  });

  it("treats an issue with only ended deployments as in_focus", () => {
    const issue = makeIssue({ number: 3 });
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [issue],
          deployments: [makeDeployment(3, true)], // ended
          priorities: [],
        },
      ],
    });
    expect(result.in_focus).toHaveLength(1);
    expect(result.in_flight).toEqual([]);
  });

  it("puts open issues with no deployment in in_focus", () => {
    const issue = makeIssue({ number: 4 });
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [issue],
          deployments: [],
          priorities: [],
        },
      ],
    });
    expect(result.in_focus).toHaveLength(1);
  });

  it("enriches issues with their priority from the repo's priority map", () => {
    const issue = makeIssue({ number: 5 });
    const priorities: IssuePriority[] = [
      {
        repoId: repo.id,
        issueNumber: 5,
        priority: "high",
        updatedAt: 1000,
      },
    ];
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [issue],
          deployments: [],
          priorities,
        },
      ],
    });
    const item = result.in_focus[0];
    if (item.kind !== "issue") throw new Error("expected issue");
    expect(item.priority).toBe("high");
  });

  it("defaults issues with no priority row to 'normal'", () => {
    const issue = makeIssue({ number: 6 });
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [issue],
          deployments: [],
          priorities: [],
        },
      ],
    });
    const item = result.in_focus[0];
    if (item.kind !== "issue") throw new Error("expected issue");
    expect(item.priority).toBe("normal");
  });

  it("sorts within each section by priority DESC then updatedAt DESC", () => {
    const older = makeIssue({ number: 1, updatedAt: "2026-04-01T00:00:00Z" });
    const newer = makeIssue({ number: 2, updatedAt: "2026-04-05T00:00:00Z" });
    const highOlder = makeIssue({
      number: 3,
      updatedAt: "2026-03-01T00:00:00Z",
    });
    const priorities: IssuePriority[] = [
      { repoId: repo.id, issueNumber: 3, priority: "high", updatedAt: 0 },
    ];
    const result = groupIntoSections({
      drafts: [],
      perRepo: [
        {
          repo,
          issues: [older, newer, highOlder],
          deployments: [],
          priorities,
        },
      ],
    });
    const focus = result.in_focus;
    expect(focus).toHaveLength(3);
    // high priority first (even though older), then newer, then older
    if (focus[0].kind !== "issue") throw new Error("expected issue");
    if (focus[1].kind !== "issue") throw new Error("expected issue");
    if (focus[2].kind !== "issue") throw new Error("expected issue");
    expect(focus[0].issue.number).toBe(3);
    expect(focus[1].issue.number).toBe(2);
    expect(focus[2].issue.number).toBe(1);
  });

  it("sorts drafts by priority DESC then updatedAt DESC", () => {
    const normalOlder = makeDraft({ title: "A", priority: "normal", updatedAt: 100 });
    const normalNewer = makeDraft({ title: "B", priority: "normal", updatedAt: 200 });
    const high = makeDraft({ title: "C", priority: "high", updatedAt: 50 });
    const result = groupIntoSections({
      drafts: [normalOlder, normalNewer, high],
      perRepo: [],
    });
    const titles = result.unassigned.map((item) => {
      if (item.kind !== "draft") throw new Error("expected draft");
      return item.draft.title;
    });
    expect(titles).toEqual(["C", "B", "A"]);
  });
});
```

- [ ] **Step 2: Run the test — it should fail**

Run: `pnpm -F @issuectl/core test unified-list`
Expected: Failure — module `./unified-list.js` not found.

- [ ] **Step 3: Implement `groupIntoSections`** at `packages/core/src/data/unified-list.ts`:

```typescript
import type {
  Draft,
  Repo,
  IssuePriority,
  Deployment,
  Priority,
  UnifiedList,
  UnifiedListItem,
} from "../types.js";
import type { GitHubIssue } from "../github/types.js";

export type PerRepoData = {
  repo: Repo;
  issues: GitHubIssue[];
  deployments: Deployment[];
  priorities: IssuePriority[];
};

export type GroupIntoSectionsInput = {
  drafts: Draft[];
  perRepo: PerRepoData[];
};

const PRIORITY_RANK: Record<Priority, number> = {
  high: 2,
  normal: 1,
  low: 0,
};

function compareByPriorityThenUpdatedAt(
  aPriority: Priority,
  aUpdatedAt: number,
  bPriority: Priority,
  bUpdatedAt: number,
): number {
  const rankDiff = PRIORITY_RANK[bPriority] - PRIORITY_RANK[aPriority];
  if (rankDiff !== 0) return rankDiff;
  return bUpdatedAt - aUpdatedAt;
}

export function groupIntoSections(
  input: GroupIntoSectionsInput,
): UnifiedList {
  // Unassigned: all drafts, sorted by priority DESC then updatedAt DESC
  const unassigned: UnifiedListItem[] = input.drafts
    .slice()
    .sort((a, b) =>
      compareByPriorityThenUpdatedAt(
        a.priority,
        a.updatedAt,
        b.priority,
        b.updatedAt,
      ),
    )
    .map((draft) => ({ kind: "draft" as const, draft }));

  const in_focus: UnifiedListItem[] = [];
  const in_flight: UnifiedListItem[] = [];
  const shipped: UnifiedListItem[] = [];

  for (const { repo, issues, deployments, priorities } of input.perRepo) {
    // Build a set of issue numbers with an active deployment (ended_at IS NULL)
    const activeLaunchSet = new Set(
      deployments
        .filter((d) => d.endedAt === null)
        .map((d) => d.issueNumber),
    );

    // Build a priority map for this repo
    const priorityMap = new Map<number, Priority>(
      priorities.map((p) => [p.issueNumber, p.priority]),
    );

    for (const issue of issues) {
      const priority = priorityMap.get(issue.number) ?? "normal";
      let section: "in_focus" | "in_flight" | "shipped";

      if (issue.state === "closed") {
        section = "shipped";
      } else if (activeLaunchSet.has(issue.number)) {
        section = "in_flight";
      } else {
        section = "in_focus";
      }

      const item: UnifiedListItem = {
        kind: "issue",
        repo,
        issue,
        priority,
        section,
      };

      if (section === "in_focus") in_focus.push(item);
      else if (section === "in_flight") in_flight.push(item);
      else shipped.push(item);
    }
  }

  // Sort each issue section by priority DESC then updatedAt DESC
  const sortIssues = (items: UnifiedListItem[]): UnifiedListItem[] =>
    items.slice().sort((a, b) => {
      if (a.kind !== "issue" || b.kind !== "issue") return 0;
      const aUpdated = new Date(a.issue.updatedAt).getTime();
      const bUpdated = new Date(b.issue.updatedAt).getTime();
      return compareByPriorityThenUpdatedAt(
        a.priority,
        aUpdated,
        b.priority,
        bUpdated,
      );
    });

  return {
    unassigned,
    in_focus: sortIssues(in_focus),
    in_flight: sortIssues(in_flight),
    shipped: sortIssues(shipped),
  };
}
```

- [ ] **Step 4: Run the test — should pass**

Run: `pnpm -F @issuectl/core test unified-list`
Expected: All 9 tests pass.

- [ ] **Step 5: Run the full core suite for regressions**

Run: `pnpm -F @issuectl/core test`
Expected: ~178 tests passing (was 169 + 9 new).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/data/unified-list.ts packages/core/src/data/unified-list.test.ts
git commit -m "feat(core): groupIntoSections pure helper"
```

---

### Task 3.3: Implement `getUnifiedList` data function

**Files:**
- Modify: `packages/core/src/data/unified-list.ts`

- [ ] **Step 1: Add new imports + export at the top/end of `unified-list.ts`**

Add the imports:

```typescript
import type Database from "better-sqlite3";
import type { Octokit } from "@octokit/rest";
import { listDrafts } from "../db/drafts.js";
import { listRepos } from "../db/repos.js";
import { getDeploymentsByRepo } from "../db/deployments.js";
import { listPrioritiesForRepo } from "../db/priority.js";
import { getIssues } from "./issues.js";
```

Then append the new function at the end of `unified-list.ts`:

```typescript
export async function getUnifiedList(
  db: Database.Database,
  octokit: Octokit,
): Promise<UnifiedList> {
  const drafts = listDrafts(db);
  const repos = listRepos(db);

  // Fetch issues for each tracked repo in parallel. Uses the existing
  // SWR cache in data/issues.ts, so cold-cache calls hit GitHub and
  // warm-cache calls return cached data with a subsequent background
  // refresh — we don't block on that refresh here.
  const perRepo: PerRepoData[] = await Promise.all(
    repos.map(async (repo) => {
      const { issues } = await getIssues(db, octokit, repo.owner, repo.name);
      const deployments = getDeploymentsByRepo(db, repo.id);
      const priorities = listPrioritiesForRepo(db, repo.id);
      return { repo, issues, deployments, priorities };
    }),
  );

  return groupIntoSections({ drafts, perRepo });
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm -F @issuectl/core typecheck`
Expected: Zero errors.

- [ ] **Step 3: Run the full core suite — nothing should regress**

Run: `pnpm -F @issuectl/core test`
Expected: Same test count passing.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/data/unified-list.ts
git commit -m "feat(core): getUnifiedList aggregates across tracked repos"
```

---

### Task 3.4: Export new symbols from `@issuectl/core`

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add new type exports**

Find the `export type { ... } from "./types.js"` block and add `Section`, `UnifiedListItem`, `UnifiedList` to it:

```typescript
export type {
  Repo,
  Setting,
  SettingKey,
  Deployment,
  CacheEntry,
  Draft,
  DraftInput,
  Priority,
  IssuePriority,
  Section,
  UnifiedListItem,
  UnifiedList,
} from "./types.js";
```

- [ ] **Step 2: Add the function export**

Find the existing data function exports (e.g., `getIssues`, `getPulls`, `getDashboardData`, `getComments`, `addComment`). Append a new export block right after:

```typescript
export {
  getUnifiedList,
  groupIntoSections,
  type PerRepoData,
  type GroupIntoSectionsInput,
} from "./data/unified-list.js";
```

- [ ] **Step 3: Run full monorepo build + typecheck**

Run: `pnpm turbo build && pnpm turbo typecheck`
Expected: All packages build cleanly. `@issuectl/core/dist/index.d.ts` grows by the new exports.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export UnifiedList types and getUnifiedList"
```

---

### Task 3.5: Add `Checkbox` Paper primitive

**Files:**
- Create: `packages/web/components/paper/Checkbox.tsx`
- Create: `packages/web/components/paper/Checkbox.module.css`

**Mockup reference:** `docs/mockups/paper-reskin.html#flow1` — the checkbox has four visual states: `open` (hollow square), `flight` (filled center, pulsing green), `done` (filled + white tick), `draft` (hollow square, same as open).

- [ ] **Step 1: Create `Checkbox.module.css`**:

```css
.box {
  width: 20px;
  height: 20px;
  display: inline-block;
  flex-shrink: 0;
}

.box svg {
  width: 100%;
  height: 100%;
  display: block;
}

.box .rect {
  fill: transparent;
  stroke: var(--paper-ink-muted);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.flight .rect {
  stroke: var(--paper-accent);
  stroke-width: 2;
}

.flight .fill {
  fill: var(--paper-accent);
  opacity: 0.35;
  animation: pulse 1.8s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.75;
  }
}

.done .rect {
  fill: var(--paper-accent);
  stroke: var(--paper-accent);
}

.done .tick {
  fill: none;
  stroke: var(--paper-bg);
  stroke-width: 2.3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
```

- [ ] **Step 2: Create `Checkbox.tsx`**:

```typescript
import styles from "./Checkbox.module.css";

type CheckboxState = "open" | "flight" | "done" | "draft";

type Props = {
  state: CheckboxState;
};

export function Checkbox({ state }: Props) {
  // "draft" renders the same as "open" — both are hollow squares.
  const visualState = state === "draft" ? "open" : state;
  const className = `${styles.box} ${styles[visualState] ?? ""}`;

  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 20 20">
        <rect className={styles.rect} x="2" y="2" width="16" height="16" rx="2" />
        {visualState === "flight" && (
          <rect className={styles.fill} x="5" y="5" width="10" height="10" rx="1" />
        )}
        {visualState === "done" && (
          <path className={styles.tick} d="M6 10.5 l2.8 2.8 L14.5 7" />
        )}
      </svg>
    </span>
  );
}
```

- [ ] **Step 3: Add `Checkbox` to the paper barrel** at `packages/web/components/paper/index.ts`:

```typescript
export { Chip } from "./Chip";
export { Button } from "./Button";
export { Sheet } from "./Sheet";
export { Drawer } from "./Drawer";
export { Checkbox } from "./Checkbox";
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm -F @issuectl/web typecheck`
Expected: Zero errors.

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/paper/Checkbox.tsx packages/web/components/paper/Checkbox.module.css packages/web/components/paper/index.ts
git commit -m "feat(web): add Checkbox Paper primitive (open / flight / done / draft)"
```

---

### Task 3.6: Add `FAB` Paper primitive

**Files:**
- Create: `packages/web/components/paper/Fab.tsx`
- Create: `packages/web/components/paper/Fab.module.css`

**Mockup reference:** `docs/mockups/paper-reskin.html#flow1` — the floating `+` button anchors the bottom right of the main list on mobile. Ink circle, serif `+`, shadow.

- [ ] **Step 1: Create `Fab.module.css`**:

```css
.fab {
  position: fixed;
  right: 24px;
  bottom: 30px;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: var(--paper-ink);
  color: var(--paper-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--paper-serif);
  font-weight: 400;
  font-size: 34px;
  line-height: 1;
  padding-bottom: 4px;
  box-shadow: 0 16px 40px rgba(26, 23, 18, 0.35),
    0 0 0 6px rgba(26, 23, 18, 0.06);
  z-index: 100;
  border: none;
  cursor: pointer;
}

.fab:hover {
  opacity: 0.92;
}

@media (min-width: 768px) {
  .fab {
    right: 40px;
    bottom: 40px;
  }
}
```

- [ ] **Step 2: Create `Fab.tsx`**:

```typescript
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Fab.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  "aria-label": string; // required for a11y
};

export function Fab({ children = "+", className, ...rest }: Props) {
  const classes = [styles.fab, className ?? ""].filter(Boolean).join(" ");
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Add `Fab` to the paper barrel**

In `packages/web/components/paper/index.ts`, add:

```typescript
export { Fab } from "./Fab";
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm -F @issuectl/web typecheck`
Expected: Zero errors.

- [ ] **Step 5: Commit**

```bash
git add packages/web/components/paper/Fab.tsx packages/web/components/paper/Fab.module.css packages/web/components/paper/index.ts
git commit -m "feat(web): add Fab Paper primitive"
```

---

### Task 3.7: Create `ListRow` component

**Files:**
- Create: `packages/web/components/list/ListRow.tsx`
- Create: `packages/web/components/list/ListRow.module.css`

**Mockup reference:** Flow 01 row anatomy — checkbox + title + meta row (repo chip / #num / label / age).

- [ ] **Step 1: Create `ListRow.module.css`**:

```css
.item {
  padding: 16px 24px 16px 58px;
  position: relative;
  border-bottom: 1px solid var(--paper-line-soft);
  display: block;
  color: inherit;
  text-decoration: none;
}

.item:hover {
  background: var(--paper-bg-warm);
}

.check {
  position: absolute;
  left: 24px;
  top: 18px;
}

.title {
  font-family: var(--paper-serif);
  font-weight: 400;
  font-size: 17px;
  line-height: 1.3;
  color: var(--paper-ink);
  margin-bottom: 6px;
  letter-spacing: -0.1px;
}

.title.done {
  color: var(--paper-ink-muted);
  text-decoration: line-through;
  text-decoration-color: var(--paper-accent);
  text-decoration-thickness: 1.5px;
}

.meta {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 11px;
  color: var(--paper-ink-muted);
}

.num {
  font-family: var(--paper-mono);
  color: var(--paper-ink-faint);
}

.sep {
  color: var(--paper-ink-faint);
}

.lblBug {
  color: var(--paper-brick);
}

.lblFeat {
  color: var(--paper-butter);
}
```

- [ ] **Step 2: Create `ListRow.tsx`**:

```typescript
import type { UnifiedListItem } from "@issuectl/core";
import { Checkbox, Chip } from "@/components/paper";
import styles from "./ListRow.module.css";

type Props = {
  item: UnifiedListItem;
};

function formatAge(updatedAt: string | number): string {
  const now = Date.now();
  const updated =
    typeof updatedAt === "number" ? updatedAt * 1000 : new Date(updatedAt).getTime();
  const diffMs = now - updated;
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "1d";
  return `${diffDays}d`;
}

function labelClass(labelName: string): string | undefined {
  const lower = labelName.toLowerCase();
  if (lower.includes("bug")) return styles.lblBug;
  if (lower.includes("feat") || lower.includes("enhancement")) return styles.lblFeat;
  return undefined;
}

export function ListRow({ item }: Props) {
  if (item.kind === "draft") {
    return (
      <div className={styles.item}>
        <span className={styles.check}>
          <Checkbox state="draft" />
        </span>
        <div className={styles.title}>{item.draft.title}</div>
        <div className={styles.meta}>
          <Chip variant="dashed">no repo</Chip>
          <span className={styles.sep}>·</span>
          <span>local draft</span>
          <span className={styles.sep}>·</span>
          <span>{formatAge(item.draft.updatedAt)}</span>
        </div>
      </div>
    );
  }

  const { issue, repo, section } = item;
  const checkState =
    section === "shipped" ? "done" : section === "in_flight" ? "flight" : "open";
  const titleClass =
    section === "shipped" ? `${styles.title} ${styles.done}` : styles.title;

  const firstLabel = issue.labels.find(
    (l) => !l.name.startsWith("issuectl:"),
  );

  return (
    <div className={styles.item}>
      <span className={styles.check}>
        <Checkbox state={checkState} />
      </span>
      <div className={titleClass}>{issue.title}</div>
      <div className={styles.meta}>
        <Chip>{repo.name}</Chip>
        <span className={styles.num}>#{issue.number}</span>
        {firstLabel && (
          <>
            <span className={styles.sep}>·</span>
            <span className={labelClass(firstLabel.name)}>{firstLabel.name}</span>
          </>
        )}
        <span className={styles.sep}>·</span>
        <span>{formatAge(issue.updatedAt)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm -F @issuectl/web typecheck`
Expected: Zero errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/list/ListRow.tsx packages/web/components/list/ListRow.module.css
git commit -m "feat(web): add ListRow component for unified-list items"
```

---

### Task 3.8: Create `ListSection` component

**Files:**
- Create: `packages/web/components/list/ListSection.tsx`
- Create: `packages/web/components/list/ListSection.module.css`

**Mockup reference:** Flow 01 section header — italic serif name, horizontal rule, mono count.

- [ ] **Step 1: Create `ListSection.module.css`**:

```css
.section {
  padding: 22px 24px 6px;
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.section h3 {
  font-family: var(--paper-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 13px;
  color: var(--paper-ink-soft);
  margin: 0;
}

.rule {
  flex: 1;
  height: 1px;
  background: var(--paper-line);
}

.count {
  font-family: var(--paper-mono);
  font-size: 10px;
  color: var(--paper-ink-faint);
  font-weight: 500;
}
```

- [ ] **Step 2: Create `ListSection.tsx`**:

```typescript
import type { ReactNode } from "react";
import type { UnifiedListItem } from "@issuectl/core";
import { ListRow } from "./ListRow";
import styles from "./ListSection.module.css";

type Props = {
  title: ReactNode;
  items: UnifiedListItem[];
};

export function ListSection({ title, items }: Props) {
  if (items.length === 0) return null;

  return (
    <>
      <div className={styles.section}>
        <h3>{title}</h3>
        <div className={styles.rule} />
        <span className={styles.count}>{items.length}</span>
      </div>
      {items.map((item) => (
        <ListRow
          key={item.kind === "draft" ? `draft-${item.draft.id}` : `issue-${item.repo.id}-${item.issue.number}`}
          item={item}
        />
      ))}
    </>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm -F @issuectl/web typecheck`
Expected: Zero errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/list/ListSection.tsx packages/web/components/list/ListSection.module.css
git commit -m "feat(web): add ListSection component"
```

---

### Task 3.9: Create main `List` client component

**Files:**
- Create: `packages/web/components/list/List.tsx`
- Create: `packages/web/components/list/List.module.css`

The main `List` is a **client component** so it can manage the open/close state of the `CreateDraftSheet` and `AssignSheet` that Tasks 3.10 and 3.11 create. The data is fetched server-side (in `page.tsx`) and passed in as a prop.

- [ ] **Step 1: Create `List.module.css`**:

```css
.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 12px 0 120px;
  background: var(--paper-bg);
  min-height: 100vh;
  position: relative;
}

.topBar {
  padding: 52px 24px 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.brand {
  font-family: var(--paper-serif);
  font-weight: 500;
  font-style: italic;
  font-size: 34px;
  line-height: 1;
  letter-spacing: -0.8px;
  color: var(--paper-ink);
}

.brand .dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  background: var(--paper-accent);
  border-radius: 50%;
  margin-left: 3px;
  vertical-align: 6px;
}

.date {
  font-family: var(--paper-serif);
  font-style: italic;
  font-size: 11px;
  color: var(--paper-ink-muted);
  font-weight: 500;
  text-align: right;
  line-height: 1.3;
}

.date b {
  display: block;
  color: var(--paper-ink-soft);
  font-style: normal;
  font-weight: 600;
  font-size: 13px;
  font-family: var(--paper-serif);
}

.tabs {
  padding: 18px 24px 0;
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--paper-line);
}

.tab {
  font-family: var(--paper-serif);
  font-style: italic;
  font-size: 14px;
  font-weight: 500;
  color: var(--paper-ink-muted);
  padding: 10px 2px 12px;
  margin-right: 26px;
  position: relative;
  cursor: default;
}

.tab.on {
  color: var(--paper-ink);
}

.tab.on::after {
  content: "";
  position: absolute;
  left: -4px;
  right: -4px;
  bottom: -1px;
  height: 2px;
  background: var(--paper-ink);
}

.tab .count {
  font-family: var(--paper-mono);
  font-style: normal;
  font-size: 10px;
  margin-left: 6px;
  color: var(--paper-ink-faint);
  font-weight: 500;
}

.empty {
  padding: 80px 20px 60px;
  text-align: center;
}

.emptyMark {
  font-family: var(--paper-serif);
  font-weight: 500;
  font-style: italic;
  font-size: 56px;
  line-height: 0.8;
  color: var(--paper-accent);
  margin-bottom: 18px;
}

.empty h3 {
  font-family: var(--paper-serif);
  font-weight: 500;
  font-style: italic;
  font-size: 22px;
  letter-spacing: -0.3px;
  color: var(--paper-ink);
  margin-bottom: 8px;
}

.empty p {
  font-family: var(--paper-serif);
  font-size: 14px;
  color: var(--paper-ink-muted);
  max-width: 280px;
  margin: 0 auto;
  line-height: 1.55;
}

.empty p em {
  color: var(--paper-ink-soft);
}
```

- [ ] **Step 2: Create `List.tsx`**:

```typescript
"use client";

import { useState } from "react";
import type { UnifiedList } from "@issuectl/core";
import { Fab } from "@/components/paper";
import { ListSection } from "./ListSection";
import { CreateDraftSheet } from "./CreateDraftSheet";
import styles from "./List.module.css";

type Props = {
  data: UnifiedList;
};

function formatDate(d: Date): { weekday: string; short: string } {
  const weekday = d
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase();
  const short = d
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toLowerCase();
  return { weekday, short };
}

export function List({ data }: Props) {
  const [createOpen, setCreateOpen] = useState(false);

  const issueCount =
    data.unassigned.length +
    data.in_focus.length +
    data.in_flight.length +
    data.shipped.length;
  const { weekday, short } = formatDate(new Date());
  const isEmpty = issueCount === 0;

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.brand}>
          issuectl<span className={styles.dot} />
        </div>
        <div className={styles.date}>
          {weekday}
          <b>{short}</b>
        </div>
      </div>
      <div className={styles.tabs}>
        <div className={`${styles.tab} ${styles.on}`}>
          Issues<span className={styles.count}>{issueCount}</span>
        </div>
        <div className={styles.tab}>
          Pull requests<span className={styles.count}>0</span>
        </div>
      </div>

      {isEmpty ? (
        <div className={styles.empty}>
          <div className={styles.emptyMark}>❧</div>
          <h3>all clear</h3>
          <p>
            nothing on your plate today.{" "}
            <em>breathe, or draft the next one.</em>
          </p>
        </div>
      ) : (
        <div>
          <ListSection title="unassigned" items={data.unassigned} />
          <ListSection title="in focus" items={data.in_focus} />
          <ListSection title="in flight" items={data.in_flight} />
          <ListSection title="shipped" items={data.shipped} />
        </div>
      )}

      <Fab
        aria-label="Create a new draft"
        onClick={() => setCreateOpen(true)}
      />
      <CreateDraftSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
```

**Note:** this imports `CreateDraftSheet` from Task 3.11 below. Typecheck will fail until that task is complete. That's expected — commit this task's code anyway, then complete Task 3.11 to fix it.

- [ ] **Step 3: Commit**

```bash
git add packages/web/components/list/List.tsx packages/web/components/list/List.module.css
git commit -m "feat(web): add List client component (sheet state management)"
```

Note: don't run typecheck here — it will fail on the missing `CreateDraftSheet` import. Task 3.11 resolves it.

---

### Task 3.10: Add Server Actions for draft creation and assignment

**Files:**
- Create: `packages/web/lib/actions/drafts.ts`

- [ ] **Step 1: Check if `packages/web/lib/actions/` exists**

Run: `ls packages/web/lib/actions/ 2>/dev/null || echo "NOT YET"`
If it doesn't exist, the file create will create the directory.

- [ ] **Step 2: Create `packages/web/lib/actions/drafts.ts`**:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import {
  getDb,
  getOctokit,
  createDraft,
  assignDraftToRepo,
  type DraftInput,
} from "@issuectl/core";

export async function createDraftAction(
  input: DraftInput,
): Promise<{ id: string }> {
  const db = getDb();
  const draft = createDraft(db, input);
  revalidatePath("/");
  return { id: draft.id };
}

export async function assignDraftAction(
  draftId: string,
  repoId: number,
): Promise<{ issueNumber: number; issueUrl: string }> {
  const db = getDb();
  const octokit = await getOctokit();
  const result = await assignDraftToRepo(db, octokit, draftId, repoId);
  revalidatePath("/");
  return { issueNumber: result.issueNumber, issueUrl: result.issueUrl };
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm -F @issuectl/web typecheck`
Expected: Zero errors (the action file itself; ignore errors from List.tsx pending Task 3.11).

- [ ] **Step 4: Commit**

```bash
git add packages/web/lib/actions/drafts.ts
git commit -m "feat(web): add createDraftAction and assignDraftAction server actions"
```

---

### Task 3.11: Add `CreateDraftSheet` component (title-only)

**Files:**
- Create: `packages/web/components/list/CreateDraftSheet.tsx`
- Create: `packages/web/components/list/CreateDraftSheet.module.css`

**Mockup reference:** Flow 03 — the new draft form. Phase 3 ships a title-only version; body + repo picker + labels come in a later phase.

- [ ] **Step 1: Create `CreateDraftSheet.module.css`**:

```css
.form {
  padding: 0 28px 28px;
}

.input {
  width: 100%;
  font-family: var(--paper-serif);
  font-weight: 400;
  font-size: 26px;
  line-height: 1.2;
  letter-spacing: -0.4px;
  color: var(--paper-ink);
  border: none;
  background: transparent;
  padding: 4px 0 16px;
  outline: none;
}

.input::placeholder {
  color: var(--paper-ink-faint);
  font-style: italic;
}

.hint {
  font-family: var(--paper-serif);
  font-style: italic;
  font-size: 11.5px;
  color: var(--paper-ink-faint);
  margin-bottom: 18px;
}

.actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.error {
  font-family: var(--paper-serif);
  font-size: 12.5px;
  color: var(--paper-brick);
  margin-bottom: 10px;
}
```

- [ ] **Step 2: Create `CreateDraftSheet.tsx`**:

```typescript
"use client";

import { useState } from "react";
import { Button, Sheet } from "@/components/paper";
import { createDraftAction } from "@/lib/actions/drafts";
import styles from "./CreateDraftSheet.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CreateDraftSheet({ open, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (title.trim().length === 0) {
      setError("A title is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createDraftAction({ title });
      setTitle("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setTitle("");
    setError(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="New draft"
      description={<em>a local draft without a repo — assign it later</em>}
    >
      <div className={styles.form}>
        <input
          className={styles.input}
          placeholder="What needs to be done?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={saving}
          autoFocus
        />
        <div className={styles.hint}>
          body, labels, and repo assignment come in a later iteration
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.actions}>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>
            cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "saving…" : "save draft"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 3: Run typecheck — should pass now that both List.tsx and CreateDraftSheet.tsx exist**

Run: `pnpm -F @issuectl/web typecheck`
Expected: Zero errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/list/CreateDraftSheet.tsx packages/web/components/list/CreateDraftSheet.module.css
git commit -m "feat(web): add CreateDraftSheet (title-only minimum)"
```

---

### Task 3.12: Replace `app/page.tsx` with the new main list

**Files:**
- Modify: `packages/web/app/page.tsx`

- [ ] **Step 1: Read the current `page.tsx` so you know what you're replacing**

Run: `cat packages/web/app/page.tsx`

The current file imports from dashboard components and renders the old repo grid. Everything in it becomes dead code after this task (Phase 8 cleanup deletes the old components).

- [ ] **Step 2: Replace `packages/web/app/page.tsx` with the new list**:

```typescript
import { getDb, getOctokit, getUnifiedList, listRepos, dbExists } from "@issuectl/core";
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";
import { List } from "@/components/list/List";

export const dynamic = "force-dynamic";

export default async function MainListPage() {
  // Preserve the existing first-run behavior: no DB, or no tracked repos,
  // falls back to the WelcomeScreen onboarding flow.
  if (!dbExists()) {
    return <WelcomeScreen />;
  }

  const db = getDb();
  if (listRepos(db).length === 0) {
    return <WelcomeScreen />;
  }

  const octokit = await getOctokit();
  const data = await getUnifiedList(db, octokit);

  return <List data={data} />;
}
```

- [ ] **Step 3: Run full typecheck + build**

Run: `pnpm turbo typecheck && pnpm -F @issuectl/web build`
Expected: Both pass cleanly.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/page.tsx
git commit -m "feat(web): replace dashboard with new Paper main list"
```

---

### Task 3.13: Run final monorepo verification

No new files in this task — just a full-stack sanity check that Phase 3's changes integrate cleanly.

- [ ] **Step 1: Full monorepo typecheck**

Run: `pnpm turbo typecheck`
Expected: All 4 typecheck tasks pass.

- [ ] **Step 2: Full monorepo build**

Run: `pnpm turbo build`
Expected: All 3 packages build.

- [ ] **Step 3: Full monorepo lint**

Run: `pnpm turbo lint`
Expected: Zero errors, zero warnings.

- [ ] **Step 4: Core test suite**

Run: `pnpm -F @issuectl/core test`
Expected: All ~178 tests pass.

- [ ] **Step 5: Eyeball the dev server**

Run (separate terminal): `pnpm -F @issuectl/web dev`
Open `http://localhost:3847` in a browser.
Expected: The main page renders the new Paper main list instead of the old repo grid. Existing tracked repos' issues appear in the appropriate sections (unassigned/in focus/in flight/shipped). Clicking a row does nothing (Phase 4). Clicking the FAB opens the CreateDraftSheet and saving a draft persists it (visible in the unassigned section after save).

Stop the dev server.

No commit for this task — it's verification only.

---

### Task 3.14: (No code — final summary + follow-up tasks)

This is a bookkeeping task to report the state of Phase 3 and identify what needs to come in Phase 3.1 or later.

**Deferred for Phase 3.1 or beyond:**
- **AssignSheet** — the sheet for picking a target repo for a draft. Infrastructure is ready (`Sheet` primitive + `assignDraftAction` server action), but the UI component and the swipe gesture that opens it are deferred.
- **Row swipe gesture** — mobile swipe-from-right to reveal the assign action.
- **Desktop hover quick actions** — `assign / reassign / launch` buttons that appear on row hover.
- **Row tap → issue detail** — waits for Phase 4 to implement the detail routes.
- **Launch button wiring** — waits for Phase 5.
- **PR tab variant** — waits for Phase 7.
- **Mobile nav drawer** — waits for Phase 7.
- **Priority picker** — waits for Phase 7.

**What's shippable now:**
- Cross-repo read-only flat list with correct sectioning and priority ordering.
- Draft creation (title only) via FAB + sheet.
- All Phase 1+2 data-layer functions remain available and tested.

---

## Self-Review Checklist

Before executing this plan, verify:

- [ ] **Spec coverage** — every line item in the spec's Phase 3 description maps to a task:
  - Cross-repo data aggregation → Task 3.2, 3.3
  - Section grouping logic → Task 3.2
  - Priority ordering → Task 3.2
  - Replace `app/page.tsx` → Task 3.12
  - (Swipe handler and assign sheet deferred to Phase 3.1 — documented in Task 3.14)

- [ ] **Placeholders** — no "TBD", "TODO", "fill in details" anywhere

- [ ] **Type consistency** — `UnifiedListItem`, `UnifiedList`, `Section`, `PerRepoData` used consistently. `groupIntoSections` signature matches across Task 3.2 and Task 3.3.

- [ ] **Existing function signatures verified** — `getIssues`, `listRepos`, `getDeploymentsByRepo`, `listPrioritiesForRepo`, `listDrafts` — all already exist with the signatures used in Task 3.3. Read their source before starting Task 3.3 to confirm nothing has drifted.

- [ ] **Out-of-order typecheck warning** — Task 3.9 creates `List.tsx` which imports `CreateDraftSheet` from Task 3.11; typecheck will fail between 3.9 and 3.11. This is called out explicitly in 3.9's steps. Don't treat it as a bug; just complete Task 3.11 to resolve.
