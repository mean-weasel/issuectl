"use client";

import Link from "next/link";
import { getErrorHint } from "@/lib/getErrorHint";
import { Button } from "./Button";
import styles from "./ErrorState.module.css";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export function ErrorState({ error, reset }: Props) {
  const hint = getErrorHint(error.message);

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.icon} aria-hidden="true">!</div>
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.message}>{error.message}</p>
        {hint && <p className={styles.hint}>{hint}</p>}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
          <Link href="/" className={styles.link}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
