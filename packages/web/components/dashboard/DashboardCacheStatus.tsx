"use client";

import { useEffect, useTransition } from "react";
import { refreshDashboard } from "@/lib/actions/refresh";
import { useToast } from "@/components/ui/ToastProvider";
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
  const { showToast } = useToast();

  useEffect(() => {
    if (isStale) {
      startTransition(async () => {
        const result = await refreshDashboard();
        if (!result.success) {
          showToast("Auto-refresh failed — data may be stale", "error");
        }
      });
    }
  }, [isStale, startTransition, showToast]);

  function handleManualRefresh() {
    startTransition(async () => {
      const result = await refreshDashboard();
      if (!result.success) {
        showToast("Refresh failed. Check your GitHub token and try again.", "error");
      }
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
