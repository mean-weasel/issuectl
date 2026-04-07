import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

type Props = {
  title: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
};

export function PageHeader({ title, actions, breadcrumb }: Props) {
  return (
    <div className={styles.header}>
      {breadcrumb && <div className={styles.breadcrumb}>{breadcrumb}</div>}
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{title}</h1>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
