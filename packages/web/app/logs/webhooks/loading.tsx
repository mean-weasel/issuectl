import styles from "./page.module.css";

export default function WebhookLogLoading() {
  return (
    <main className={styles.shell}>
      <div className={styles.skeletonHeader} />
      <div className={styles.skeletonToolbar} />
      <div className={styles.skeletonTable} />
    </main>
  );
}
