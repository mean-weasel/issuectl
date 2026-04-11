import type { ReactNode } from "react";
import Link from "next/link";
import styles from "./DetailTopBar.module.css";

type Props = {
  backHref?: string;
  crumb?: ReactNode;
  menu?: ReactNode;
};

export function DetailTopBar({
  backHref = "/",
  crumb,
  menu,
}: Props) {
  return (
    <div className={styles.bar}>
      <Link href={backHref} className={styles.back} aria-label="Back">
        ‹
      </Link>
      {crumb && <div className={styles.crumb}>{crumb}</div>}
      {menu && <div className={styles.menu}>{menu}</div>}
    </div>
  );
}
