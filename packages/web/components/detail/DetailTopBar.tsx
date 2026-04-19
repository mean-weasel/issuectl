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
    // Use browser history when the referrer is our own app, so filter
    // state in query params is preserved. When the user arrived from an
    // external link (Slack, email, etc.), fall through to the hard
    // <Link> href to avoid navigating them out of the app.
    if (
      window.history.length > 1 &&
      document.referrer.startsWith(window.location.origin)
    ) {
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
