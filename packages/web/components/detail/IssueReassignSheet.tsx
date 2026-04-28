"use client";

import { Sheet, Button } from "@/components/paper";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import assignStyles from "../list/AssignSheet.module.css";

type Repo = { id: number; owner: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  owner: string;
  repo: string;
  repoId: number;
  number: number;
  repos: Repo[];
  loadingRepos: boolean;
  selectedRepo: Repo | null;
  reassigning: boolean;
  reassignError: string | null;
  onSelectRepo: (repo: Repo) => void;
  onConfirm: () => void;
  onCancelSelection: () => void;
};

export function IssueReassignSheet({
  open,
  onClose,
  owner,
  repo,
  repoId,
  number,
  repos,
  loadingRepos,
  selectedRepo,
  reassigning,
  reassignError,
  onSelectRepo,
  onConfirm,
  onCancelSelection,
}: Props) {
  const otherRepos = repos.filter((r) => r.id !== repoId);

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="re-assign to repo"
        description={
          <em>
            #{number} &mdash; currently on {owner}/{repo}
          </em>
        }
      >
        <div className={assignStyles.body}>
          {loadingRepos && (
            <div className={assignStyles.loading}>loading repos…</div>
          )}
          {reassignError && !selectedRepo && (
            <div className={assignStyles.error}>{reassignError}</div>
          )}
          {!loadingRepos && otherRepos.length === 0 && !reassignError && (
            <div className={assignStyles.empty}>
              <em>no other repos available</em>
            </div>
          )}
          {otherRepos.map((targetRepo) => (
            <button
              key={targetRepo.id}
              className={assignStyles.row}
              onClick={() => onSelectRepo(targetRepo)}
              disabled={reassigning}
            >
              <div className={assignStyles.repoName}>{targetRepo.name}</div>
              <div className={assignStyles.repoOwner}>{targetRepo.owner}</div>
            </button>
          ))}
          <div className={assignStyles.footer}>
            <Button variant="ghost" onClick={onClose} disabled={reassigning}>
              cancel
            </Button>
          </div>
        </div>
      </Sheet>

      {selectedRepo && (
        <ConfirmDialog
          title="Re-assign Issue"
          message={`Move issue #${number} from ${owner}/${repo} to ${selectedRepo.owner}/${selectedRepo.name}? The old issue will be closed with a cross-reference.`}
          confirmLabel="Re-assign"
          confirmVariant="default"
          onConfirm={onConfirm}
          onCancel={onCancelSelection}
          isPending={reassigning}
          error={reassignError ?? undefined}
        />
      )}
    </>
  );
}
