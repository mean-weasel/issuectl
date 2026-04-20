import Link from "next/link";
import type { UnifiedListItem } from "@issuectl/core";
import { Checkbox, Chip, LabelChip } from "@/components/paper";
import { SyncDot } from "@/components/ui/SyncDot";
import { SwipeRow } from "./SwipeRow";
import styles from "./ListRow.module.css";

type Props = {
  item: UnifiedListItem;
  onLaunch?: (owner: string, repo: string, issueNumber: number) => void;
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

export function ListRow({ item, onLaunch }: Props) {
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
            <SyncDot status="local" label="local draft" />
            <span className={styles.sep}>·</span>
            <span>{formatAge(item.draft.updatedAt)}</span>
          </div>
        </Link>
      </div>
    );
  }

  const { issue, repo, section } = item;
  const checkState =
    section === "closed" ? "done" : section === "running" ? "flight" : "open";
  const titleClass =
    section === "closed" ? `${styles.title} ${styles.done}` : styles.title;

  const displayLabels = issue.labels.filter(
    (l) => !l.name.startsWith("issuectl:"),
  );

  // Label reflects what the click does: running rows open an active
  // session rather than launching, so "launch" would mislead.
  // Exhaustive switch so a future addition to the Section union is a
  // compile error here instead of silently rendering "launch →" on a
  // section that should not launch.
  let actionLabel: string;
  let actionAria: string;
  switch (section) {
    case "open":
      actionLabel = "launch";
      actionAria = "Launch issue";
      break;
    case "running":
      actionLabel = "open";
      actionAria = "Open active session";
      break;
    case "closed":
      actionLabel = "view";
      actionAria = "View issue";
      break;
    default: {
      const _exhaustive: never = section;
      throw new Error(`ListRow: unhandled section ${String(_exhaustive)}`);
    }
  }

  const rowContent = (
    <div className={styles.item} data-section={section}>
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
          {issue.commentCount > 0 && (
            <>
              <span className={styles.sep}>·</span>
              <span className={styles.comments}>
                <svg
                  className={styles.commentIcon}
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2v2.19l2.72-2.72.53-.22h4.25a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
                </svg>
                {issue.commentCount}
              </span>
            </>
          )}
          <span className={styles.sep}>·</span>
          <span>{formatAge(issue.updatedAt)}</span>
          {issue.user && (
            <>
              <span className={styles.sep}>·</span>
              <span className={styles.author}>{issue.user.login}</span>
            </>
          )}
          {section === "running" && (
            <>
              <span className={styles.sep}>·</span>
              <span className={styles.activeLabel}>active</span>
            </>
          )}
        </div>
      </Link>
      <div className={styles.actions}>
        {section === "open" && onLaunch ? (
          <button
            className={styles.actionBtn}
            onClick={() => onLaunch(repo.owner, repo.name, issue.number)}
            aria-label={actionAria}
          >
            {actionLabel} →
          </button>
        ) : (
          <Link
            href={`/issues/${repo.owner}/${repo.name}/${issue.number}`}
            className={`${styles.actionBtn} ${section === "running" ? styles.actionBtnRunning : ""}`}
            aria-label={actionAria}
          >
            {actionLabel} →
          </Link>
        )}
      </div>
    </div>
  );

  if (section === "open" && onLaunch) {
    return (
      <SwipeRow
        onLaunch={() => onLaunch(repo.owner, repo.name, issue.number)}
      >
        {rowContent}
      </SwipeRow>
    );
  }

  return rowContent;
}
