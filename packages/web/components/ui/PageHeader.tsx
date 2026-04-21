import type { ReactNode } from "react";
import { VersionBadge } from "@/components/ui/VersionBadge";
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
          <VersionBadge className={styles.versionBadge} />
        </h1>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
