import styles from "./loading.module.css";

export default function Loading() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.breadcrumb} />
        <div className={styles.titleRow}>
          <div className={styles.title} />
          <div className={styles.actions}>
            <div className={styles.actionBtn} />
            <div className={styles.actionBtn} />
            <div className={styles.actionBtnLaunch} />
          </div>
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.main}>
          <div className={styles.bodyBlock} />
          <div className={styles.commentsTitle} />
          <div className={styles.commentCard} />
          <div className={styles.commentCard} />
        </div>
        <div className={styles.sidebar}>
          <div className={styles.sidebarCard} style={{ height: 140 }} />
          <div className={styles.sidebarCard} style={{ height: 80 }} />
          <div className={styles.sidebarCard} style={{ height: 120 }} />
          <div className={styles.sidebarCard} style={{ height: 90 }} />
        </div>
      </div>
    </div>
  );
}
