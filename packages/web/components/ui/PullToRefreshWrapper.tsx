"use client";

import type { ReactNode } from "react";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { refreshAction } from "@/lib/actions/refresh";
import styles from "./PullToRefreshWrapper.module.css";

type Props = {
  children: ReactNode;
  /** Override the default global cache-clear with a targeted action. */
  action?: () => Promise<{ success: boolean; error?: string }>;
};

export function PullToRefreshWrapper({ children, action }: Props) {
  const router = useRouter();

  const onRefresh = useCallback(async () => {
    const result = await (action ?? refreshAction)();
    if (!result.success) {
      console.warn("[issuectl] Pull-to-refresh failed:", result.error);
    }
    router.refresh();
  }, [router, action]);

  const { containerRef, pullDistance, refreshing } = usePullToRefresh({
    onRefresh,
  });

  return (
    <div ref={containerRef} className={styles.container}>
      {(pullDistance > 0 || refreshing) && (
        <div
          className={styles.indicator}
          style={
            pullDistance > 0
              ? { height: pullDistance, opacity: Math.min(pullDistance / 60, 1) }
              : undefined
          }
        >
          <div className={refreshing ? styles.spinnerActive : styles.spinner}>
            ↻
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
