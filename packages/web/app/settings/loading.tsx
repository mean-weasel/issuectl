import styles from "./loading.module.css";

export default function Loading() {
  return (
    <div className={styles.container}>
      <div className={styles.headerSkeleton}>
        <div className={styles.titleBar} />
      </div>
      <div className={styles.content}>
        {/* Tracked Repositories */}
        <div className={styles.section}>
          <div className={styles.sectionTitle} />
          <div className={styles.row} />
          <div className={styles.row} />
          <div className={styles.row} />
        </div>

        {/* Defaults */}
        <div className={styles.section}>
          <div className={styles.sectionTitle} />
          <div className={styles.rowWide} />
          <div className={styles.rowShort} />
        </div>

        {/* Terminal */}
        <div className={styles.section}>
          <div className={styles.sectionTitle} />
          <div className={styles.rowShort} />
        </div>

        {/* Worktrees */}
        <div className={styles.section}>
          <div className={styles.sectionTitle} />
          <div className={styles.rowWide} />
        </div>

        {/* Authentication */}
        <div className={styles.section}>
          <div className={styles.sectionTitle} />
          <div className={styles.rowShort} />
        </div>
      </div>
    </div>
  );
}
