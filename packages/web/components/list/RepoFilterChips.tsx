import Link from "next/link";
import { REPO_COLORS } from "@/lib/constants";
import { repoKey } from "@/lib/repo-key";
import styles from "./RepoFilterChips.module.css";

type Repo = { owner: string; name: string };

type Props = {
  repos: Repo[];
  activeRepo: string | null;
  buildHref: (repoKey: string | null) => string;
};

export function RepoFilterChips({ repos, activeRepo, buildHref }: Props) {
  if (repos.length <= 1) return null;

  return (
    <nav className={styles.row} aria-label="Filter by repository">
      <Link
        href={buildHref(null)}
        className={activeRepo === null ? styles.chipActive : styles.chip}
        aria-current={activeRepo === null ? "page" : undefined}
      >
        all
      </Link>
      {repos.map((repo, i) => {
        const key = repoKey(repo);
        const isActive = key === activeRepo;
        const color = REPO_COLORS[i % REPO_COLORS.length];
        return (
          <Link
            key={key}
            href={buildHref(key)}
            className={isActive ? styles.chipActive : styles.chip}
            aria-current={isActive ? "page" : undefined}
            style={isActive ? { borderColor: color } : undefined}
          >
            <span className={styles.dot} style={{ background: color }} />
            {repo.name}
          </Link>
        );
      })}
    </nav>
  );
}
