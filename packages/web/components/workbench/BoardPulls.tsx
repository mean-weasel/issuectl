import { useEffect, useMemo, useState } from "react";
import { requestJson, type ListResponse, type PullSummary } from "./pull-requests-data";
import type { WorkbenchRepo } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type RepoPullState = {
  status: "idle" | "loading" | "loaded" | "error";
  pulls: PullSummary[];
  error: string | null;
};

export function useBoardPulls(repos: WorkbenchRepo[]): Record<string, RepoPullState> {
  const repoKeys = useMemo(() => repos.map(repoKey).sort(), [repos]);
  const repoSignature = repoKeys.join("|");
  const repoLookup = useMemo(
    () => new Map(repos.map((repo) => [repoKey(repo), repo])),
    [repos],
  );
  const [states, setStates] = useState<Record<string, RepoPullState>>({});

  useEffect(() => {
    const controller = new AbortController();
    const nextKeys = new Set(repoKeys);
    setStates((current) => {
      const next: Record<string, RepoPullState> = {};
      for (const key of repoKeys) {
        next[key] = current[key] ?? { status: "loading", pulls: [], error: null };
      }
      return next;
    });

    for (const key of repoKeys) {
      const repo = repoLookup.get(key);
      if (!repo) continue;
      setStates((current) => ({
        ...current,
        [key]: { status: "loading", pulls: current[key]?.pulls ?? [], error: null },
      }));
      void requestJson<ListResponse>(
        `/api/v1/pulls/${repo.owner}/${repo.name}?checks=true`,
        { method: "GET", signal: controller.signal },
      )
        .then((body) => {
          if (controller.signal.aborted || !nextKeys.has(key)) return;
          setStates((current) => ({
            ...current,
            [key]: { status: "loaded", pulls: body.pulls, error: null },
          }));
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || !nextKeys.has(key)) return;
          const message = err instanceof Error ? err.message : "Unable to load pull requests";
          setStates((current) => ({
            ...current,
            [key]: { status: "error", pulls: [], error: message },
          }));
        });
    }

    return () => controller.abort();
  }, [repoKeys, repoLookup, repoSignature]);

  return states;
}

export function RepoPullsSummary({
  repo,
  state,
}: {
  repo: WorkbenchRepo;
  state?: RepoPullState;
}) {
  const repoLabel = repoKey(repo);
  const status = state?.status ?? "idle";
  const pulls = state?.pulls ?? [];
  const repoParam = encodeURIComponent(repoLabel);
  const label = status === "loaded" ? `${pulls.length} ${pulls.length === 1 ? "PR" : "PRs"}` : status === "error" ? "PR error" : "PRs loading";

  if (status === "loaded" && pulls.length > 0) {
    return <a aria-label={`Board pull requests for ${repoLabel}`} className={styles.boardPullBadge} href={`/workbench/prs?repo=${repoParam}`}>{label}</a>;
  }

  return <span aria-label={`Board pull requests for ${repoLabel}`} className={styles.boardPullBadge} data-status={status}>{label}</span>;
}

export function repoKey(repo: Pick<WorkbenchRepo, "owner" | "name">): string {
  return `${repo.owner}/${repo.name}`;
}
