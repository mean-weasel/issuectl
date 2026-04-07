import Link from "next/link";
import { getDb, listRepos, getCached } from "@issuectl/core";
import type { GitHubIssue, GitHubPull } from "@issuectl/core";
import { REPO_COLORS } from "@/lib/constants";
import { SidebarRepoList } from "./SidebarRepoList";
import styles from "./Sidebar.module.css";

type Props = {
  username: string;
};

export async function Sidebar({ username }: Props) {
  let repos: Array<{ owner: string; name: string; issueCount: number }> = [];
  let totalIssues = 0;
  let totalPRs = 0;

  try {
    const db = getDb();
    const dbRepos = listRepos(db);
    repos = dbRepos.map((r) => {
      const cached = getCached<GitHubIssue[]>(db, `issues:${r.owner}/${r.name}`);
      const openCount = cached
        ? cached.data.filter((i) => i.state === "open").length
        : 0;
      return { owner: r.owner, name: r.name, issueCount: openCount };
    });
    totalIssues = repos.reduce((sum, r) => sum + r.issueCount, 0);

    for (const r of dbRepos) {
      const cached = getCached<GitHubPull[]>(db, `pulls:${r.owner}/${r.name}`);
      if (cached) {
        totalPRs += cached.data.filter((p) => p.state === "open").length;
      }
    }
  } catch (err) {
    // DB may not exist on first run (before 'issuectl init')
    console.warn("[issuectl] Sidebar failed to load repos:", err);
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <div className={styles.logoMark}>ic</div>
        <span className={styles.logoText}>issuectl</span>
        <span className={styles.logoVersion}>v0.1.0</span>
      </div>

      <nav className={styles.nav}>
        <Link href="/" className={styles.navItemActive}>
          <span className={styles.navIcon}>&bull;</span>
          Dashboard
        </Link>
        <Link href="/" className={styles.navItem}>
          <span className={styles.navIcon}>&rarr;</span>
          Issues
          {totalIssues > 0 && (
            <span className={styles.navBadge}>{totalIssues}</span>
          )}
        </Link>
        <Link href="/" className={styles.navItem}>
          <span className={styles.navIcon}>&uarr;</span>
          Pull Requests
          {totalPRs > 0 && (
            <span className={styles.navBadge}>{totalPRs}</span>
          )}
        </Link>
        <Link href="/settings" className={styles.navItem}>
          <span className={styles.navIcon}>&#9881;</span>
          Settings
        </Link>
      </nav>

      <div className={styles.divider} />
      <div className={styles.sectionTitle}>Repositories</div>

      <SidebarRepoList repos={repos} colors={REPO_COLORS} />

      <div className={styles.footer}>
        <span className={styles.authDot} />
        <span>{username} via gh auth</span>
      </div>
    </aside>
  );
}
