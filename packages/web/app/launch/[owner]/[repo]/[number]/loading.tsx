import styles from "./loading.module.css";

export default function Loading() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.breadcrumb} />
      </div>
      <div className={styles.body}>
        <div className={styles.title} />
        <div className={styles.subtitle} />
        <div className={styles.steps}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={styles.step}>
              <div className={styles.dot} />
              <div className={styles.rows}>
                <div className={styles.labelRow} />
                <div className={styles.detailRow} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
