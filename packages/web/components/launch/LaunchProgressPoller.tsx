"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 5000;

type Props = {
  active: boolean;
};

// Drives a parent Server Component re-fetch via router.refresh() while the
// deployment is active — the RSC equivalent of a polling fetch. Pauses on
// visibilitychange so a backgrounded tab doesn't keep firing GitHub-backed
// refreshes (battery, API quota). Browsers throttle hidden-tab timers, but
// not aggressively enough to skip this.
export function LaunchProgressPoller({ active }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        router.refresh();
      }, POLL_INTERVAL_MS);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [active, router]);

  return null;
}
