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
        <h1 className={styles.title}>
          {title}
          <span className={styles.versionBadge}>
            v{process.env.NEXT_PUBLIC_APP_VERSION || "dev"}
          </span>
        </h1>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
