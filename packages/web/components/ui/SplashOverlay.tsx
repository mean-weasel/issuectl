import styles from "./SplashOverlay.module.css";

export function SplashOverlay() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

  return (
    <div className={styles.overlay} aria-hidden="true">
      <div className={styles.logoMark}>ic</div>
      <div className={styles.title}>issuectl</div>
      <div className={styles.version}>v{version}</div>
    </div>
  );
}
