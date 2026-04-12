import styles from "./loading.module.css";

export default function Loading() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.breadcrumb} />
      </div>
      <div className={styles.body}>
        <div className={styles.title} />
        <div className={styles.meta}>
          <div className={styles.metaChip} />
          <div className={styles.metaText} />
          <div className={styles.metaText} />
        </div>
        <div className={styles.hint} />
        <div className={styles.textarea} />
      </div>
    </div>
  );
}
