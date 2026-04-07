import Link from "next/link";
import styles from "./Sidebar.module.css";

type Props = {
  repos: Array<{ owner: string; name: string; issueCount: number }>;
  colors: string[];
};

export function SidebarRepoList({ repos, colors }: Props) {
  if (repos.length === 0) {
    return (
      <div className={styles.repos}>
        <div style={{ padding: "8px 12px", fontSize: "12px", color: "var(--text-tertiary)" }}>
          No repositories tracked
        </div>
      </div>
    );
  }

  return (
    <div className={styles.repos}>
      {repos.map((repo, i) => (
        <Link
          key={`${repo.owner}/${repo.name}`}
          href={`/${repo.owner}/${repo.name}`}
          className={styles.repoItem}
        >
          <span
            className={styles.repoDot}
            style={{ background: colors[i % colors.length] }}
          />
          <span className={styles.repoLabel}>{repo.name}</span>
          {repo.issueCount > 0 && (
            <span className={styles.repoCount}>{repo.issueCount}</span>
          )}
        </Link>
      ))}
    </div>
  );
}
