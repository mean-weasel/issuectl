"use client";

import { useState } from "react";
import type { GitHubLabel } from "@issuectl/core";
import type { RepoOption } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { CreateIssueModal } from "./CreateIssueModal";

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
