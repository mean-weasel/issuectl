import styles from "./WorkbenchPage.module.css";

export default function WorkbenchLoading() {
  return (
    <div className={styles.loadingShell} aria-label="Loading workbench">
      <div className={styles.loadingTopbar} />
      <div className={styles.loadingGrid}>
        <div className={styles.loadingRail} />
        <div className={styles.loadingPane} />
        <div className={styles.loadingFocus} />
        <div className={styles.loadingPane} />
      </div>
    </div>
  );
}
