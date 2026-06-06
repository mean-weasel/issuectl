import type { WorkbenchRepo } from "./workbench-types";
import { compactRepoInitials, repoRailBadgeCount } from "./workbench-selectors";
import styles from "./WorkbenchShell.module.css";

type Props = {
  repos: WorkbenchRepo[] | null;
  selectedRepoId: number | null;
  status: "loading" | "loaded" | "error";
  onSelectRepo: (repoId: number) => void;
  onAddRepository: () => void;
  onOpenSettings: () => void;
};

export function RepoRail({
  repos,
  selectedRepoId,
  status,
  onSelectRepo,
  onAddRepository,
  onOpenSettings,
}: Props) {
  if (status === "loading" || status === "error") {
    return (
      <>
        <div className={styles.repoSkeleton} aria-hidden="true" />
        <div className={styles.repoSkeleton} aria-hidden="true" />
        <div className={styles.railSpacer} />
      </>
    );
  }

  if (!repos || repos.length === 0) {
    return (
      <>
        <button type="button" className={styles.railButton} aria-label="Add repository" onClick={onAddRepository}>
          +
        </button>
        <div className={styles.railSpacer} />
        <button type="button" className={styles.railButton} aria-label="Open settings" onClick={onOpenSettings}>
          ::
        </button>
      </>
    );
  }

  return (
    <>
      {repos.map((repo) => {
        const count = repoRailBadgeCount(repo);
        const selected = repo.id === selectedRepoId;
        const label = repoLabel(repo);
        return (
          <button
            key={repo.id}
            type="button"
            className={styles.repoButton}
            aria-label={label}
            aria-pressed={selected}
            data-selected={selected ? "true" : undefined}
            title={label}
            onClick={() => onSelectRepo(repo.id)}
          >
            {compactRepoInitials(repo.name)}
            <span className={styles.repoButtonTooltip} aria-hidden="true">{label}</span>
            {count > 0 && <span className={styles.badge}>{count}</span>}
          </button>
        );
      })}
      <div className={styles.railSpacer} />
      <button type="button" className={styles.railButton} aria-label="Add repository" onClick={onAddRepository}>
        +
      </button>
      <button type="button" className={styles.railButton} aria-label="Open settings" onClick={onOpenSettings}>
        ::
      </button>
    </>
  );
}

function repoLabel(repo: WorkbenchRepo): string {
  return `${repo.owner}/${repo.name}`;
}
