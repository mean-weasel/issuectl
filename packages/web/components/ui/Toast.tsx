"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import styles from "./Toast.module.css";

export type ToastType = "success" | "error" | "warning";

type ToastData = {
  message: string;
  type: ToastType;
  id: number;
};

type Props = {
  toast: ToastData;
  onDismiss: () => void;
};

const EXIT_MS = 150;

export function Toast({ toast, onDismiss }: Props) {
  const [exiting, setExiting] = useState(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    autoTimerRef.current = setTimeout(() => {
      setExiting(true);
      exitTimerRef.current = setTimeout(onDismiss, EXIT_MS);
    }, 4000);
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, [toast.id, onDismiss]);

  function handleDismiss() {
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    setExiting(true);
    exitTimerRef.current = setTimeout(onDismiss, EXIT_MS);
  }

  return (
    <div
      className={cn(styles.toast, styles[toast.type])}
      data-exiting={exiting ? "true" : undefined}
      role={toast.type === "error" || toast.type === "warning" ? "alert" : "status"}
    >
      <span className={styles.message}>{toast.message}</span>
      <button className={styles.dismiss} onClick={handleDismiss} aria-label="Dismiss">
        &times;
      </button>
    </div>
  );
}

export type { ToastData };
