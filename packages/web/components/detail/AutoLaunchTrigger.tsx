"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

type Props = {
  hasLiveDeployment: boolean;
  onTrigger: () => void;
};

/**
 * Reads `?launch=true` from the URL and fires `onTrigger` on mount
 * when there is no live deployment.
 *
 * Extracted into its own component so it can be wrapped in a dedicated
 * `<Suspense>` boundary — `useSearchParams()` forces the entire route
 * into dynamic rendering unless the caller is independently suspendable.
 */
export function AutoLaunchTrigger({ hasLiveDeployment, onTrigger }: Props) {
  const searchParams = useSearchParams();

  // Keep refs so the mount-only effect always reads the latest values
  // without re-triggering (guards against concurrent-render staleness).
  const hasLiveRef = useRef(hasLiveDeployment);
  useEffect(() => { hasLiveRef.current = hasLiveDeployment; }, [hasLiveDeployment]);
  const onTriggerRef = useRef(onTrigger);
  useEffect(() => { onTriggerRef.current = onTrigger; }, [onTrigger]);

  useEffect(() => {
    if (searchParams.get("launch") === "true" && !hasLiveRef.current) {
      onTriggerRef.current();
      const url = new URL(window.location.href);
      url.searchParams.delete("launch");
      window.history.replaceState({}, "", url.toString());
    }
  }, []); // mount-only

  return null;
}
