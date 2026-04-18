import Link from "next/link";
import type { UnifiedListItem } from "@issuectl/core";
import { Checkbox, Chip, LabelChip } from "@/components/paper";
import styles from "./ListRow.module.css";

type Props = {
  item: UnifiedListItem;
};

// Drafts store updatedAt as unix seconds (SQLite INTEGER). GitHub issues
// use ISO strings. Normalize both to "N days ago" for display. Clamps
// negative diffs to "today" so a clock-skewed future timestamp doesn't
// render "-1d".
function formatAge(updatedAt: string | number): string {
  const now = Date.now();
  const updated =
    typeof updatedAt === "number"
      ? updatedAt * 1000
      : new Date(updatedAt).getTime();
  if (!Number.isFinite(updated)) return "";
  const diffDays = Math.floor((now - updated) / (24 * 60 * 60 * 1000));
  if (diffDays < 1) return "today";
  if (diffDays === 1) return "1d";
  return `${diffDays}d`;
}

export function ListRow({ item }: Props) {
  if (item.kind === "draft") {
    return (
      <div className={styles.item}>
        <Link href={`/drafts/${item.draft.id}`} className={styles.rowLink}>
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
        </Link>
      </div>
    );
  }

  const { issue, repo, section } = item;
  const checkState =
    section === "shipped" ? "done" : section === "in_flight" ? "flight" : "open";
  const titleClass =
    section === "shipped" ? `${styles.title} ${styles.done}` : styles.title;

  const displayLabels = issue.labels.filter(
    (l) => !l.name.startsWith("issuectl:"),
  );

  // Label reflects what the click does: in-flight rows open an active
  // session rather than launching, so "launch" would mislead.
  // Exhaustive switch so a future addition to the Section union is a
  // compile error here instead of silently rendering "launch →" on a
  // section that should not launch.
  let actionLabel: string;
  let actionAria: string;
  switch (section) {
    case "in_focus":
      actionLabel = "launch";
      actionAria = "Launch issue";
      break;
    case "in_flight":
      actionLabel = "open";
      actionAria = "Open active session";
      break;
    case "shipped":
      actionLabel = "view";
      actionAria = "View issue";
      break;
    default: {
      const _exhaustive: never = section;
      throw new Error(`ListRow: unhandled section ${String(_exhaustive)}`);
    }
  }

  return (
    <div className={styles.item}>
      <Link
        href={`/issues/${repo.owner}/${repo.name}/${issue.number}`}
        className={styles.rowLink}
      >
        <span className={styles.check}>
          <Checkbox state={checkState} />
        </span>
        <div className={titleClass}>{issue.title}</div>
        <div className={styles.meta}>
          <Chip>{repo.name}</Chip>
          <span className={styles.num}>#{issue.number}</span>
          {displayLabels.length > 0 && (
            <>
              <span className={styles.sep}>·</span>
              {displayLabels.map((l) => (
                <LabelChip key={l.name} name={l.name} color={l.color} />
              ))}
            </>
          )}
          <span className={styles.sep}>·</span>
          <span>{formatAge(issue.updatedAt)}</span>
        </div>
      </Link>
      <div className={styles.actions}>
        <Link
          href={`/issues/${repo.owner}/${repo.name}/${issue.number}`}
          className={`${styles.actionBtn} ${section === "in_flight" ? styles.actionBtnFlight : ""}`}
          aria-label={actionAria}
        >
          {actionLabel} →
        </Link>
      </div>
    </div>
  );
}
