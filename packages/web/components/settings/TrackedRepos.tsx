"use client";

import { useState } from "react";
import type { Repo } from "@issuectl/core";
import { REPO_COLORS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { RepoRow } from "./RepoRow";
import { AddRepoForm } from "./AddRepoForm";
import styles from "./TrackedRepos.module.css";

type Props = {
  repos: Repo[];
};

export function TrackedRepos({ repos }: Props) {
  const [showAdd, setShowAdd] = useState(false);

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
        <AddRepoForm onClose={() => setShowAdd(false)} />
      ) : (
        <Button
          variant="secondary"
          className={styles.addBtn}
          onClick={() => setShowAdd(true)}
        >
          + Add Repo
        </Button>
      )}
    </>
  );
}
