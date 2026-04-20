"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Section, UnifiedList } from "@issuectl/core";
import type { PrEntry } from "@/lib/page-filters";
import { ListSection } from "./ListSection";
import { PrListRow } from "./PrListRow";
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
        {renderIssueSection({ activeSection, data, visibleCount, onLaunch: handleLaunch })}
        {total > PAGE_SIZE && (
          <div className={styles.pageStatus}>
            Showing {showing} of {total}
          </div>
        )}
        {visibleCount < total && (
          <div ref={sentinelRef} className={styles.sentinel} />
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
}: {
  activeSection: Section;
  data: UnifiedList;
  visibleCount: number;
  onLaunch: (owner: string, repo: string, issueNumber: number) => void;
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
  return <ListSection title={null} items={items} onLaunch={onLaunch} />;
}
