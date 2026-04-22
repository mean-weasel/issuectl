"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();

  function handleBack(e: React.MouseEvent) {
    // Prefer browser history so filter state in query params is
    // preserved. We intentionally skip the old document.referrer check
    // because it never updates during SPA navigations, causing the
    // fallback <Link> to fire and drop all filters. If the user arrived
    // from an external link, router.back() simply takes them back there
    // — standard back-button behavior.
    if (window.history.length > 1) {
      e.preventDefault();
      router.back();
    }
  }

  return (
    <div className={styles.bar}>
      <Link
        href={backHref}
        className={styles.back}
        aria-label="Back"
        onClick={handleBack}
      >
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
