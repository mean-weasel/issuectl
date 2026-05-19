"use client";

import { usePathname } from "next/navigation";
import styles from "./SplashOverlay.module.css";

export function SplashOverlay() {
  const pathname = usePathname();
  const version = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

  if (pathname?.startsWith("/workbench")) {
    return null;
  }

  return (
    <div className={styles.overlay} aria-hidden="true" data-testid="splash-overlay">
      <div className={styles.logoMark}>ic</div>
      <div className={styles.title}>issuectl</div>
      <div className={styles.version}>v{version}</div>
    </div>
  );
}
