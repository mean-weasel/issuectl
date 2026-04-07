import Link from "next/link";
import type { RepoWithStats } from "@/lib/types";
import { RepoCard } from "./RepoCard";
import styles from "./RepoGrid.module.css";

type Props = {
  repos: RepoWithStats[];
};

export function RepoGrid({ repos }: Props) {
  if (repos.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyTitle}>No repositories tracked</div>
        <p>
          Run <code>issuectl repo add</code> or go to{" "}
          <Link href="/settings" className={styles.emptyLink}>
            Settings
          </Link>{" "}
          to add your first repository.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {repos.map((repo, i) => (
        <RepoCard key={`${repo.owner}/${repo.name}`} repo={repo} index={i} />
      ))}
    </div>
  );
}
