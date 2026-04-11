import Link from "next/link";
import type { UnifiedListItem } from "@issuectl/core";
import { Checkbox, Chip } from "@/components/paper";
import styles from "./ListRow.module.css";

type Props = {
  item: UnifiedListItem;
  onAssign?: (draftId: string, draftTitle: string) => void;
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

// Case-insensitive substring match. A label like "bug-report" will match
// "bug" — that's intentional so common variants all paint brick red.
function labelClass(labelName: string): string | undefined {
  const lower = labelName.toLowerCase();
  if (lower.includes("bug")) return styles.lblBug;
  if (lower.includes("feat") || lower.includes("enhancement")) {
    return styles.lblFeat;
  }
  return undefined;
}

export function ListRow({ item, onAssign }: Props) {
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
            {onAssign && (
              <>
                <span className={styles.sep}>·</span>
                <button
                  className={styles.assignBtn}
                  onClick={(e) => {
                    e.preventDefault();
                    onAssign(item.draft.id, item.draft.title);
                  }}
                >
                  assign →
                </button>
              </>
            )}
          </div>
        </Link>
        <div className={styles.actions}>
          {onAssign && (
            <button
              className={styles.actionBtn}
              onClick={() => onAssign(item.draft.id, item.draft.title)}
              aria-label="Assign draft to repo"
            >
              assign
            </button>
          )}
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
          {firstLabel && (
            <>
              <span className={styles.sep}>·</span>
              <span className={labelClass(firstLabel.name)}>
                {firstLabel.name}
              </span>
            </>
          )}
          <span className={styles.sep}>·</span>
          <span>{formatAge(issue.updatedAt)}</span>
        </div>
      </Link>
      <div className={styles.actions}>
        <Link
          href={`/issues/${repo.owner}/${repo.name}/${issue.number}`}
          className={styles.actionBtn}
          aria-label="Open issue detail"
        >
          launch
        </Link>
      </div>
    </div>
  );
}
