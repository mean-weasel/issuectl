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
          key={
            item.kind === "draft"
              ? `draft-${item.draft.id}`
              : `issue-${item.repo.id}-${item.issue.number}`
          }
          item={item}
        />
      ))}
    </>
  );
}
