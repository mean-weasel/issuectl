import Link from "next/link";
import type { RepoWithStats } from "@/lib/types";
import { REPO_COLORS } from "@/lib/constants";
import styles from "./RepoCard.module.css";

type Props = {
  repo: RepoWithStats;
  index: number;
};

const LABEL_COLORS: Record<string, string> = {
  bug: "var(--red)",
  enhancement: "var(--purple)",
};

export function RepoCard({ repo, index }: Props) {
  const color = REPO_COLORS[index % REPO_COLORS.length];
  const totalLabeled = repo.labels.reduce((sum, l) => sum + l.count, 0);
  const unlabeled = Math.max(0, repo.issueCount - totalLabeled);

  return (
    <Link
      href={`/${repo.owner}/${repo.name}`}
      className={styles.card}
    >
      <div className={styles.header}>
        <span className={styles.dot} style={{ background: color }} />
        <span className={styles.name}>{repo.name}</span>
        <span className={styles.org}>{repo.owner}</span>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{repo.issueCount}</span>
          <span className={styles.statLabel}>Issues</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{repo.prCount}</span>
          <span className={styles.statLabel}>PRs</span>
        </div>
        <div className={styles.stat}>
          <span
            className={styles.statValue}
            style={{
              color: repo.deployedCount > 0 ? "var(--yellow)" : "var(--text-tertiary)",
            }}
          >
            {repo.deployedCount}
          </span>
          <span className={styles.statLabel}>Deployed</span>
        </div>
      </div>

      {repo.issueCount > 0 && (
        <div className={styles.bar}>
          {repo.labels.map((l) => (
            <span
              key={l.name}
              className={styles.barSegment}
              style={{
                flex: l.count,
                background: LABEL_COLORS[l.name.toLowerCase()] ?? "var(--text-tertiary)",
              }}
            />
          ))}
          {unlabeled > 0 && (
            <span
              className={styles.barSegment}
              style={{ flex: unlabeled, background: "var(--text-tertiary)" }}
            />
          )}
        </div>
      )}

      <div className={styles.tags}>
        {repo.labels.slice(0, 3).map((l) => (
          <span key={l.name} className={styles.tag}>
            {l.count} {l.name}
          </span>
        ))}
        {unlabeled > 0 && (
          <span className={styles.tag}>{unlabeled} unlabeled</span>
        )}
        {repo.oldestIssueAge > 0 && (
          <span className={styles.tag}>oldest: {repo.oldestIssueAge}d</span>
        )}
      </div>
    </Link>
  );
}
