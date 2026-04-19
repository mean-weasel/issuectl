import styles from "./ContentSkeleton.module.css";

const SKELETON_ROWS = [0, 1, 2, 3, 4];

export function ContentSkeleton() {
  return (
    <div className={styles.wrapper}>
      {SKELETON_ROWS.map((i) => (
        <div key={i} className={styles.row}>
          <div className={styles.dot} />
          <div className={styles.lines}>
            <div className={styles.title} />
            <div className={styles.sub} />
          </div>
        </div>
      ))}
    </div>
  );
}
