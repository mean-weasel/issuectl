import styles from "./loading.module.css";

export default function Loading() {
  return (
    <>
      <div className={styles.headerSkeleton}>
        <div className={styles.titleBar} />
      </div>
      <div className={styles.cacheBarSkeleton} />
      <div className={styles.skeleton}>
        <div className={styles.grid}>
          <div className={styles.cardSkeleton} />
          <div className={styles.cardSkeleton} />
          <div className={styles.cardSkeleton} />
        </div>
      </div>
    </>
  );
}
