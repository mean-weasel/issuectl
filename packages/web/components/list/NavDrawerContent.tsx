"use client";

import Link from "next/link";
import styles from "./NavDrawerContent.module.css";

type Props = {
  activeTab: "issues" | "prs";
  username: string | null;
};

export function NavDrawerContent({ activeTab, username }: Props) {
  return (
    <div className={styles.container}>
      <div className={styles.sectionLabel}>main views</div>
      <Link
        href="/"
        className={`${styles.item} ${activeTab === "issues" ? styles.on : ""}`}
      >
        All issues<NavChevron />
      </Link>
      <Link
        href="/?tab=prs"
        className={`${styles.item} ${activeTab === "prs" ? styles.on : ""}`}
      >
        Pull requests<NavChevron />
      </Link>

      <div className={styles.sectionLabel}>actions</div>
      <Link href="/new" className={styles.item}>
        New Issue<NavChevron />
      </Link>
      <Link href="/parse" className={styles.item}>
        Quick Create<NavChevron />
      </Link>
      <Link href="/settings" className={styles.item}>
        Settings<NavChevron />
      </Link>

      <div className={styles.footer}>
        {username && (
          <div className={styles.footerRow}>
            <span>
              <span className={styles.dot} />
              {username}
            </span>
            <span className={styles.auth}>gh ✓</span>
          </div>
        )}
      </div>
    </div>
  );
}

function NavChevron() {
  return (
    <svg
      className={styles.arrow}
      width="8"
      height="14"
      viewBox="0 0 8 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1 1l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
