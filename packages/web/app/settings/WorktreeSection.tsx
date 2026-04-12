import { WorktreeCleanup } from "@/components/settings/WorktreeCleanup";
import { listWorktrees } from "@/lib/actions/worktrees";

export async function WorktreeSection() {
  const worktrees = await listWorktrees().catch((err) => {
    console.error("[issuectl] Failed to list worktrees:", err);
    return [] as Awaited<ReturnType<typeof listWorktrees>>;
  });

  return <WorktreeCleanup worktrees={worktrees} />;
}
