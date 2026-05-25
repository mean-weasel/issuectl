import Link from "next/link";
import { dbExists, getDb, listRepos } from "@issuectl/core";
import { PageHeader } from "@/components/ui/PageHeader";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Repo settings - issuectl" };

export default async function RepoSettingsIndexPage() {
  if (!dbExists()) {
    return (
      <>
        <PageHeader title="Repo settings" breadcrumb={<Link href="/settings">settings</Link>} />
        <main className={styles.shell}>
          <p className={styles.muted}>Run <code>issuectl init</code> to create the local database.</p>
        </main>
      </>
    );
  }

  const repos = listRepos(getDb());
  return (
    <>
      <PageHeader title="Repo settings" breadcrumb={<Link href="/settings">settings</Link>} />
      <main className={styles.shell}>
        <section className={styles.summary}>
          <div>
            <h1>Tracked repositories</h1>
            <p>Open a repository to configure local defaults, automation, webhook health, labels, and removal controls.</p>
          </div>
          <span className={styles.pill}>{repos.length} tracked</span>
        </section>

        <section className={styles.repoGrid} aria-label="Tracked repositories">
          {repos.map((repo) => (
            <Link
              key={repo.id}
              className={styles.repoCard}
              href={`/repos/${repo.owner}/${repo.name}/settings`}
            >
              <header>
                <div>
                  <h2>{repo.owner}/{repo.name}</h2>
                  <p className={styles.muted}>{repo.localPath ?? "No local path configured"}</p>
                </div>
                <div className={styles.repoMeta}>
                  <span className={styles.pill} data-on={repo.autoLaunchIssues}>issues</span>
                  <span className={styles.pill} data-on={repo.autoReviewPrs}>PRs</span>
                  <span className={styles.pill}>{repo.webhookId ? `hook ${repo.webhookId}` : "no hook"}</span>
                </div>
              </header>
              <span className={styles.muted}>Branch pattern: {repo.branchPattern ?? "default"}</span>
            </Link>
          ))}
          {repos.length === 0 && (
            <p className={styles.muted}>No repositories are tracked yet.</p>
          )}
        </section>
      </main>
    </>
  );
}
