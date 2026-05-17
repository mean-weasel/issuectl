"use client";

import styles from "./WorkbenchPage.module.css";

export default function WorkbenchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={styles.errorPage} role="alert">
      <p className={styles.kicker}>Workbench error</p>
      <h1>Unable to open workbench</h1>
      <p>{error.message}</p>
      <button type="button" onClick={reset}>
        Retry workbench load
      </button>
    </div>
  );
}
