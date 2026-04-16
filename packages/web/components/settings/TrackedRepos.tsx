"use client";

import { useMemo, useState } from "react";
import { repoKey, type Repo } from "@issuectl/core";
import { REPO_COLORS } from "@/lib/constants";
import { Button } from "@/components/paper";
import { RepoRow } from "./RepoRow";
import { AddRepoForm } from "./AddRepoForm";
import styles from "./TrackedRepos.module.css";

type Props = {
  repos: Repo[];
};

export function TrackedRepos({ repos }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const trackedSet = useMemo(
    () => new Set(repos.map(repoKey)),
    [repos],
  );

  return (
    <>
      {repos.map((repo, i) => (
        <RepoRow
          key={repo.id}
          repo={repo}
          color={REPO_COLORS[i % REPO_COLORS.length]}
        />
      ))}
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
