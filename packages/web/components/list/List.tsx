"use client";

import { useState } from "react";
import type { GitHubPull, Section, UnifiedList } from "@issuectl/core";
import { Drawer, Fab } from "@/components/paper";
import { ListSection } from "./ListSection";
import { PrListRow } from "./PrListRow";
import { CreateDraftSheet } from "./CreateDraftSheet";
import { AssignSheet } from "./AssignSheet";
import { NavDrawerContent } from "./NavDrawerContent";
import styles from "./List.module.css";

type PrEntry = { repo: { owner: string; name: string }; pull: GitHubPull };

type Props = {
  data: UnifiedList;
  activeTab: "issues" | "prs";
  prCount: number;
  prs: PrEntry[];
  username: string | null;
};

const SECTION_LABEL: Record<Section, string> = {
  unassigned: "unassigned",
  in_focus: "in focus",
  in_flight: "in flight",
  shipped: "shipped",
};

// Lowercase is intentional — matches the Paper mockup typography.
function formatDate(d: Date): { weekday: string; short: string } {
  const weekday = d
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase();
  const short = d
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toLowerCase();
  return { weekday, short };
}

export function List({ data, activeTab, prCount, prs, username }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const issueCount =
    data.unassigned.length +
    data.in_focus.length +
    data.in_flight.length +
    data.shipped.length;
  const { weekday, short } = formatDate(new Date());
  const isEmpty = activeTab === "issues" ? issueCount === 0 : prCount === 0;

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.brand}>
          issuectl<span className={styles.dot} />
        </div>
        <button
          className={styles.menuBtn}
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
        >
          ···
        </button>
      </div>

      {/* Desktop: date + tabs inline. Mobile: tabs only, date in drawer. */}
      <div className={styles.tabs}>
        <a
          href="/"
          className={`${styles.tab} ${activeTab === "issues" ? styles.on : ""}`}
        >
          Issues<span className={styles.count}>{issueCount}</span>
        </a>
        <a
          href="/?tab=prs"
          className={`${styles.tab} ${activeTab === "prs" ? styles.on : ""}`}
        >
          Pull requests<span className={styles.count}>{prCount}</span>
        </a>
        <div className={styles.desktopDate}>
          {weekday} · <b>{short}</b>
        </div>
      </div>

      {activeTab === "issues" ? (
        isEmpty ? (
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
            <ListSection
              title={SECTION_LABEL.unassigned}
              items={data.unassigned}
              onAssign={(id, title) => setAssignTarget({ id, title })}
            />
            <ListSection
              title={SECTION_LABEL.in_focus}
              items={data.in_focus}
              onAssign={(id, title) => setAssignTarget({ id, title })}
            />
            <ListSection
              title={SECTION_LABEL.in_flight}
              items={data.in_flight}
              onAssign={(id, title) => setAssignTarget({ id, title })}
            />
            <ListSection
              title={SECTION_LABEL.shipped}
              items={data.shipped}
              onAssign={(id, title) => setAssignTarget({ id, title })}
            />
          </div>
        )
      ) : isEmpty ? (
        <div className={styles.empty}>
          <div className={styles.emptyMark}>❧</div>
          <h3>no pull requests</h3>
          <p>
            <em>no open pull requests across your repos.</em>
          </p>
        </div>
      ) : (
        <div>
          {prs.map(({ repo, pull }) => (
            <PrListRow
              key={`pr-${repo.owner}-${repo.name}-${pull.number}`}
              owner={repo.owner}
              repoName={repo.name}
              pull={pull}
            />
          ))}
        </div>
      )}

      {activeTab === "issues" && (
        <>
          <Fab
            aria-label="Create a new draft"
            onClick={() => setCreateOpen(true)}
          />
          <CreateDraftSheet
            open={createOpen}
            onClose={() => setCreateOpen(false)}
          />
          <AssignSheet
            open={assignTarget !== null}
            onClose={() => setAssignTarget(null)}
            draftId={assignTarget?.id ?? ""}
            draftTitle={assignTarget?.title ?? ""}
          />
        </>
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={
          <>
            issuectl<span className={styles.drawerDot} />
          </>
        }
      >
        <NavDrawerContent activeTab={activeTab} username={username} />
      </Drawer>
    </div>
  );
}
