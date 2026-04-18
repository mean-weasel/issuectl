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
        <svg
          width="12"
          height="20"
          viewBox="0 0 12 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M10 2L2 10L10 18"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
      {crumb && <div className={styles.crumb}>{crumb}</div>}
      {menu && <div className={styles.menu}>{menu}</div>}
    </div>
  );
}
