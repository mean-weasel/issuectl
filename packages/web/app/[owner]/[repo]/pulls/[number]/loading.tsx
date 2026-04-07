import styles from "./loading.module.css";

export default function Loading() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.breadcrumb} />
        <div className={styles.titleRow}>
          <div className={styles.title} />
          <div className={styles.badge} />
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.main}>
          <div className={styles.statRow} />
          <div className={styles.bodyBlock} />
          <div className={styles.commentsTitle} />
          <div className={styles.commentCard} />
        </div>
        <div className={styles.sidebar}>
          <div className={styles.sidebarCard} style={{ height: 140 }} />
          <div className={styles.sidebarCard} style={{ height: 70 }} />
          <div className={styles.sidebarCard} style={{ height: 60 }} />
          <div className={styles.sidebarCard} style={{ height: 160 }} />
        </div>
      </div>
    </div>
  );
}
