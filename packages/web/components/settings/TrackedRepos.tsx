"use client";

import { useMemo, useState } from "react";
import type { Repo } from "@issuectl/core";
import { REPO_COLORS } from "@/lib/constants";
import { repoKey } from "@/lib/repo-key";
import { Button } from "@/components/paper";
import { RepoRow } from "./RepoRow";
import { AddRepoForm } from "./AddRepoForm";
import styles from "./TrackedRepos.module.css";

type Props = {
  repos: Repo[];
};

const COLLAPSED_LIMIT = 5;

export function TrackedRepos({ repos }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const trackedSet = useMemo(
    () => new Set(repos.map(repoKey)),
    [repos],
  );

  const visibleRepos = expanded ? repos : repos.slice(0, COLLAPSED_LIMIT);
  const hasMore = repos.length > COLLAPSED_LIMIT;

  return (
    <>
      {visibleRepos.map((repo, i) => (
        <RepoRow
          key={repo.id}
          repo={repo}
          color={REPO_COLORS[i % REPO_COLORS.length]}
        />
      ))}
      {hasMore && !expanded && (
        <button
          type="button"
          className={styles.showAllBtn}
          onClick={() => setExpanded(true)}
        >
          show all {repos.length} repos
        </button>
      )}
      {showAdd ? (
        <AddRepoForm
          onClose={() => setShowAdd(false)}
          trackedSet={trackedSet}
        />
      ) : (
        <Button
          variant="ghost"
          className={styles.addBtn}
          onClick={() => setShowAdd(true)}
        >
          + Add Repo
        </Button>
      )}
    </>
  );
}
