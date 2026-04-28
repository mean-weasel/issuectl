"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

type Props = {
  hasLiveDeployment: boolean;
  onTrigger: () => void;
};

/**
 * Reads `?launch=true` from the URL and fires `onTrigger` on mount.
 *
 * Extracted into its own component so it can be wrapped in a dedicated
 * `<Suspense>` boundary — `useSearchParams()` de-opts SSR for the entire
 * route unless the caller is independently suspendable.
 */
export function AutoLaunchTrigger({ hasLiveDeployment, onTrigger }: Props) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("launch") === "true" && !hasLiveDeployment) {
      onTrigger();
      const url = new URL(window.location.href);
      url.searchParams.delete("launch");
      window.history.replaceState({}, "", url.toString());
    }
    // Only run on mount — hasLiveDeployment and onTrigger are read from
    // the initial render; subsequent changes are intentionally ignored.
  }, []); // mount-only

  return null;
}
