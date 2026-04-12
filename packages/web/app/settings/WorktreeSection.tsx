import { WorktreeCleanup } from "@/components/settings/WorktreeCleanup";
import { listWorktrees } from "@/lib/actions/worktrees";
import type { WorktreeInfo } from "@/lib/actions/worktrees";

export async function WorktreeSection() {
  let worktrees: WorktreeInfo[];
  try {
    worktrees = await listWorktrees();
  } catch (err) {
    console.error("[issuectl] Failed to list worktrees:", err);
    return (
      <div role="alert" style={{ color: "var(--paper-brick)", fontSize: 13 }}>
        Failed to load worktrees. Check that the database is accessible.
      </div>
    );
  }

  return <WorktreeCleanup worktrees={worktrees} />;
}
