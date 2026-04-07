"use client";

import { useState } from "react";
import type { GitHubLabel } from "@issuectl/core";
import { Button } from "@/components/ui/Button";
import { CreateIssueModal } from "./CreateIssueModal";

export type RepoOption = { owner: string; repo: string };

type Props = {
  repos: RepoOption[];
  currentRepo: RepoOption;
  availableLabels: GitHubLabel[];
};

export function NewIssueButton({ repos, currentRepo, availableLabels }: Props) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Button variant="primary" onClick={() => setShowModal(true)}>
        New Issue
      </Button>
      {showModal && (
        <CreateIssueModal
          repos={repos}
          defaultRepo={currentRepo}
          availableLabels={availableLabels}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
