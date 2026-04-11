"use client";

import { useState } from "react";
import type { GitHubIssue } from "@issuectl/core";
import { Button } from "@/components/paper";
import { IssueBody } from "./IssueBody";
import { EditIssueForm } from "./EditIssueForm";
import styles from "./IssueDetailClient.module.css";

type Props = {
  owner: string;
  repo: string;
  issue: GitHubIssue;
};

export function IssueDetailClient({ owner, repo, issue }: Props) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <EditIssueForm
        owner={owner}
        repo={repo}
        issue={issue}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <>
      <div className={styles.editRow}>
        {issue.state === "open" && (
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>
      <IssueBody body={issue.body} />
    </>
  );
}
