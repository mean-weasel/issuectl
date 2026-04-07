"use client";

import { useTransition } from "react";
import { refreshDashboard } from "@/lib/actions/refresh";
import styles from "./CacheBar.module.css";

type Props = {
  cachedAt: string | null;
  totalIssues: number;
  totalPRs: number;
};

function formatAge(dateStr: string | null): string {
  if (!dateStr) return "not cached";
  const ms = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  return `${minutes} minutes ago`;
}

export function CacheBar({ cachedAt, totalIssues, totalPRs }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleRefresh() {
    startTransition(async () => {
      await refreshDashboard();
    });
  }

  return (
    <div className={styles.bar}>
      <span className={styles.dot} />
      <span>
        cached {formatAge(cachedAt)} &middot; {totalIssues} issues &middot;{" "}
        {totalPRs} PRs
      </span>
      <button
        className={styles.refreshLink}
        onClick={handleRefresh}
        disabled={isPending}
      >
        {isPending ? "refreshing..." : "refresh now"}
      </button>
    </div>
  );
}
