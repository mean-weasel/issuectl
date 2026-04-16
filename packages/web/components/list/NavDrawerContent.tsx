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
        All issues<span className={styles.arrow}>›</span>
      </Link>
      <Link
        href="/?tab=prs"
        className={`${styles.item} ${activeTab === "prs" ? styles.on : ""}`}
      >
        Pull requests<span className={styles.arrow}>›</span>
      </Link>

      <div className={styles.sectionLabel}>actions</div>
      <Link href="/new" className={styles.item}>
        New Issue<span className={styles.arrow}>›</span>
      </Link>
      <Link href="/parse" className={styles.item}>
        Quick Create<span className={styles.arrow}>›</span>
      </Link>
      <Link href="/settings" className={styles.item}>
        Settings<span className={styles.arrow}>›</span>
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
