import styles from "./CacheBar.module.css";

type Props = {
  cachedAt: string | null;
  totalIssues: number;
  totalPRs: number;
  isRevalidating: boolean;
  onManualRefresh: () => void;
};

function formatAge(dateStr: string | null): string {
  if (!dateStr) return "not cached";
  const ms = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  return `${minutes} minutes ago`;
}

export function CacheBar({
  cachedAt,
  totalIssues,
  totalPRs,
  isRevalidating,
  onManualRefresh,
}: Props) {
  return (
    <div className={styles.bar}>
      <span className={isRevalidating ? styles.dotPulsing : styles.dot} />
      <span>
        cached {formatAge(cachedAt)} &middot; {totalIssues} issues &middot;{" "}
        {totalPRs} PRs
      </span>
      {isRevalidating ? (
        <span className={styles.updating}>updating...</span>
      ) : (
        <button
          className={styles.refreshLink}
          onClick={onManualRefresh}
        >
          refresh now
        </button>
      )}
    </div>
  );
}
