"use client";

import { useState, useEffect } from "react";
import styles from "./OfflineIndicator.module.css";

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    setIsOffline(!navigator.onLine);

    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <svg
        className={styles.icon}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6" />
        <line x1="8" y1="5" x2="8" y2="8.5" />
        <line x1="8" y1="11" x2="8.01" y2="11" />
      </svg>
      Offline — viewing cached data
    </div>
  );
}
