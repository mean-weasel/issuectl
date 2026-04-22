"use client";

import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Section, UnifiedList } from "@issuectl/core";
import type { PrEntry } from "@/lib/page-filters";
import { ListSection } from "./ListSection";
import { PrListRow } from "./PrListRow";
import { CloseIssueModal } from "@/components/ui/CloseIssueModal";
import { closeIssue } from "@/lib/actions/issues";
import { useToast } from "@/components/ui/ToastProvider";
import { buildHref } from "@/lib/list-href";
import styles from "./List.module.css";

type Props = {
  activeTab: "issues" | "prs";
  activeSection: Section;
  data: UnifiedList;
  prs: PrEntry[];
  activeRepo: string | null;
  mineOnly: boolean;
};

const PAGE_SIZE = 15;

const SECTION_EMPTY: Record<Section, { title: string; body: string }> = {
  unassigned: {
    title: "no drafts",
    body: "start a draft with the + button — it'll live here until you assign it to a repo.",
  },
  open: {
    title: "all clear",
    body: "nothing on your plate. breathe, or draft the next one.",
  },
  running: {
    title: "no running sessions",
    body: "when you launch an issue with Claude Code, it lands here while the session is active.",
  },
  closed: {
    title: "nothing closed yet",
    body: "closed issues show up here once PRs merge and reconcile.",
  },
};

export function ListContent({
  activeTab,
  activeSection,
  data,
  prs,
  activeRepo,
  mineOnly,
}: Props) {
  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const [closeTarget, setCloseTarget] = useState<{ owner: string; repo: string; number: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [closeError, setCloseError] = useState<string | null>(null);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeSection]);

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  }, []);

  const handleLaunch = useCallback(
    (owner: string, repo: string, issueNumber: number) => {
      router.push(`/issues/${owner}/${repo}/${issueNumber}?launch=true`);
    },
    [router],
  );

  const handleCloseRequest = useCallback(
    (owner: string, repo: string, issueNumber: number) => {
      setCloseError(null);
      setCloseTarget({ owner, repo, number: issueNumber });
    },
    [],
  );

  // Unlike IssueActionSheet (which has access to deployments), the list
  // view does not track live sessions — so we skip session termination
  // and only close the GitHub issue.
  const handleCloseConfirm = useCallback(
    (comment: string) => {
      if (!closeTarget) return;
      const { owner, repo, number } = closeTarget;
      startTransition(async () => {
        try {
          const result = await closeIssue(owner, repo, number, comment || undefined);
          if (!result.success) {
            setCloseError(result.error);
            return;
          }
          setCloseTarget(null);
          showToast(
            result.cacheStale
              ? "Issue closed — reload if the list looks stale"
              : "Issue closed",
            "success",
          );
          router.replace(buildHref({ section: "closed", repo: activeRepo }));
        } catch (err) {
          console.error("[issuectl] Close issue from list failed:", err);
          setCloseError("Something went wrong while closing the issue. Please try again.");
        }
      });
    },
    [closeTarget, showToast, router, activeRepo],
  );

  const handleCloseCancel = useCallback(() => {
    setCloseTarget(null);
    setCloseError(null);
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, activeSection]);

  if (activeTab === "issues") {
    const total = data[activeSection].length;
    const showing = Math.min(visibleCount, total);
    return (
      <>
        {renderIssueSection({ activeSection, data, visibleCount, onLaunch: handleLaunch, onClose: handleCloseRequest })}
        {total > PAGE_SIZE && (
          <div className={styles.pageStatus}>
            Showing {showing} of {total}
          </div>
        )}
        {visibleCount < total && (
          <div ref={sentinelRef} className={styles.sentinel} />
        )}
        {closeTarget && (
          <CloseIssueModal
            issueNumber={closeTarget.number}
            onConfirm={handleCloseConfirm}
            onCancel={handleCloseCancel}
            isPending={isPending}
            error={closeError ?? undefined}
          />
        )}
      </>
    );
  }

  if (prs.length === 0) {
    let emptyMessage: string;
    if (activeRepo && mineOnly) {
      emptyMessage = `no open PRs from you in ${activeRepo}.`;
    } else if (activeRepo) {
      emptyMessage = `no open PRs in ${activeRepo}.`;
    } else if (mineOnly) {
      emptyMessage = "no open PRs from you across your repos.";
    } else {
      emptyMessage = "no open PRs across your repos.";
    }

    return (
      <div className={styles.empty}>
        <div className={styles.emptyMark}>❧</div>
        <h3>no pull requests</h3>
        <p>
          <em>{emptyMessage}</em>
        </p>
      </div>
    );
  }

  return (
    <div>
      {prs.map(({ repo, pull }) => (
        <PrListRow
          key={`pr-${repo.owner}-${repo.name}-${pull.number}`}
          owner={repo.owner}
          repoName={repo.name}
          pull={pull}
        />
      ))}
    </div>
  );
}

function renderIssueSection({
  activeSection,
  data,
  visibleCount,
  onLaunch,
  onClose,
}: {
  activeSection: Section;
  data: UnifiedList;
  visibleCount: number;
  onLaunch: (owner: string, repo: string, issueNumber: number) => void;
  onClose: (owner: string, repo: string, issueNumber: number) => void;
}) {
  const allItems = data[activeSection];

  if (allItems.length === 0) {
    const empty = SECTION_EMPTY[activeSection];
    return (
      <div className={styles.empty}>
        <div className={styles.emptyMark}>❧</div>
        <h3>{empty.title}</h3>
        <p>
          <em>{empty.body}</em>
        </p>
      </div>
    );
  }

  const items = allItems.slice(0, visibleCount);
  return <ListSection title={null} items={items} onLaunch={onLaunch} onClose={onClose} />;
}
