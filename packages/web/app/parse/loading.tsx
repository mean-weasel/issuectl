import styles from "./loading.module.css";

export default function Loading() {
  return (
    <>
      <div className={styles.headerSkeleton}>
        <div className={styles.breadcrumb} />
        <div className={styles.titleBar} />
      </div>
      <div className={styles.content}>
        <div className={styles.description} />
        <div className={styles.textarea} />
        <div className={styles.button} />
      </div>
    </>
  );
}
