"use client";

import { useState } from "react";
import type { Section, UnifiedList } from "@issuectl/core";
import { Fab } from "@/components/paper";
import { ListSection } from "./ListSection";
import { CreateDraftSheet } from "./CreateDraftSheet";
import styles from "./List.module.css";

type Props = {
  data: UnifiedList;
};

// Display labels for each section. Kept local to the web package so the
// import of `Section` stays type-only — importing a runtime const from
// @issuectl/core pulls the whole core barrel (including better-sqlite3,
// fs, child_process) into the client bundle. `Record<Section, ...>`
// enforces exhaustiveness at compile time, so a new section variant
// can't land without adding its label here.
const SECTION_LABEL: Record<Section, string> = {
  unassigned: "unassigned",
  in_focus: "in focus",
  in_flight: "in flight",
  shipped: "shipped",
};

// Lowercase is intentional — matches the Paper mockup typography. Do not
// "fix" this to Title Case without updating the design.
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
          <ListSection
            title={SECTION_LABEL.unassigned}
            items={data.unassigned}
          />
          <ListSection title={SECTION_LABEL.in_focus} items={data.in_focus} />
          <ListSection
            title={SECTION_LABEL.in_flight}
            items={data.in_flight}
          />
          <ListSection title={SECTION_LABEL.shipped} items={data.shipped} />
        </div>
      )}

      <Fab aria-label="Create a new draft" onClick={() => setCreateOpen(true)} />
      <CreateDraftSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
