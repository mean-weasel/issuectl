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
