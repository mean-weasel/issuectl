import Link from "next/link";
import styles from "./not-found.module.css";

export default function RepoNotFound() {
  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.icon}>?</div>
        <h1 className={styles.title}>Repository not found</h1>
        <p className={styles.message}>
          This repository isn&apos;t tracked by issuectl, or it may have been removed.
        </p>
        <div className={styles.actions}>
          <Link href="/settings" className={styles.link}>
            Check Settings
          </Link>
          <Link href="/" className={styles.link}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
