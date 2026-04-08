"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import styles from "./Toast.module.css";

export type ToastType = "success" | "error";

type ToastData = {
  message: string;
  type: ToastType;
  id: number;
};

type Props = {
  toast: ToastData;
  onDismiss: () => void;
};

export function Toast({ toast, onDismiss }: Props) {
  const [exiting, setExiting] = useState(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    autoTimerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 150);
    }, 4000);
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, [toast.id, onDismiss]);

  function handleDismiss() {
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    setExiting(true);
    setTimeout(onDismiss, 150);
  }

  return (
    <div
      className={cn(styles.toast, styles[toast.type])}
      data-exiting={exiting ? "true" : undefined}
      role="status"
    >
      <span className={styles.message}>{toast.message}</span>
      <button className={styles.dismiss} onClick={handleDismiss} aria-label="Dismiss">
        &times;
      </button>
    </div>
  );
}

export type { ToastData };
