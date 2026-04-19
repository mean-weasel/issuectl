"use client";

import { useState, useEffect } from "react";
import styles from "./CacheAge.module.css";

type Props = {
  cachedAt: number | null;
};

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const REFRESH_INTERVAL = 60_000;
const SHOW_THRESHOLD = 60_000;

export function CacheAge({ cachedAt }: Props) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, []);

  if (!cachedAt) return null;

  const age = now - cachedAt;
  if (age < SHOW_THRESHOLD) return null;

  return (
    <span className={styles.badge} aria-label={`Data cached ${formatAge(age)}`}>
      Cached {formatAge(age)}
    </span>
  );
}
