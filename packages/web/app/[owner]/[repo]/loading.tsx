import styles from "./loading.module.css";

export default function Loading() {
  return (
    <div className={styles.skeleton}>
      <div className={styles.breadcrumb} />
      <div className={styles.titleBar} />
      <div className={styles.tabsBar} />
      <div className={styles.toolbarBar} />
      <div className={styles.rows}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={styles.row} />
        ))}
      </div>
    </div>
  );
}
