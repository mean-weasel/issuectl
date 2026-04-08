"use client";

import { useEffect, useTransition } from "react";
import { refreshDashboard } from "@/lib/actions/refresh";
import { CacheBar } from "./CacheBar";

type Props = {
  cachedAt: string | null;
  totalIssues: number;
  totalPRs: number;
  isStale: boolean;
};

export function DashboardCacheStatus({
  cachedAt,
  totalIssues,
  totalPRs,
  isStale,
}: Props) {
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (isStale) {
      startTransition(async () => {
        await refreshDashboard();
      });
    }
  }, [isStale, startTransition]);

  function handleManualRefresh() {
    startTransition(async () => {
      await refreshDashboard();
    });
  }

  return (
    <CacheBar
      cachedAt={cachedAt}
      totalIssues={totalIssues}
      totalPRs={totalPRs}
      isRevalidating={isPending}
      onManualRefresh={handleManualRefresh}
    />
  );
}
