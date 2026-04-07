"use client";

import Link from "next/link";
import { getErrorHint } from "@/lib/getErrorHint";
import styles from "./error.module.css";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: Props) {
  const hint = getErrorHint(error.message);

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.icon}>!</div>
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.message}>{error.message}</p>
        {hint && <p className={styles.hint}>{hint}</p>}
        <div className={styles.actions}>
          <button className={styles.retryButton} onClick={reset}>
            Try again
          </button>
          <Link href="/" className={styles.link}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
