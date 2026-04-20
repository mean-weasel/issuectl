import type { ReactNode } from "react";
import type { UnifiedListItem } from "@issuectl/core";
import { ListRow } from "./ListRow";
import styles from "./ListSection.module.css";

type Props = {
  title: ReactNode | null;
  items: UnifiedListItem[];
  onLaunch?: (owner: string, repo: string, issueNumber: number) => void;
  onNavigate?: (owner: string, repo: string, issueNumber: number) => void;
};

export function ListSection({ title, items, onLaunch, onNavigate }: Props) {
  if (items.length === 0) return null;

  return (
    <>
      {title ? (
        <div className={styles.section}>
          <h3>{title}</h3>
          <div className={styles.rule} />
          <span className={styles.count}>{items.length}</span>
        </div>
      ) : null}
      {items.map((item) => (
        <ListRow
          key={
            item.kind === "draft"
              ? `draft-${item.draft.id}`
              : `issue-${item.repo.id}-${item.issue.number}`
          }
          item={item}
          onLaunch={onLaunch}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}
