"use client";

import { useRouter } from "next/navigation";
import styles from "./DashboardError.module.css";

type Props = {
  message: string;
};

export function DashboardError({ message }: Props) {
  const router = useRouter();

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>failed to load dashboard</h3>
      <p className={styles.message}>
        <em>{message}</em>
      </p>
      <button className={styles.retry} onClick={() => router.refresh()}>
        Try again
      </button>
    </div>
  );
}
