import Link from "next/link";
import {
  dbExists,
  getDb,
  getOctokit,
  listRepos,
  listLabels,
} from "@issuectl/core";
import type { GitHubLabel } from "@issuectl/core";
import type { RepoOption } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { NewIssuePage } from "./NewIssuePage";
import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "New Issue — issuectl" };
export const dynamic = "force-dynamic";

export default async function NewIssueRoute() {
  if (!dbExists()) {
    return (
      <>
        <PageHeader title="New Issue" breadcrumb={<Link href="/">← dashboard</Link>} />
        <div className={styles.emptyState}>
          <p>
            Run <code>issuectl init</code> to get started.
          </p>
        </div>
      </>
    );
  }

  const db = getDb();
  const dbRepos = listRepos(db);

  if (dbRepos.length === 0) {
    return (
      <>
        <PageHeader title="New Issue" breadcrumb={<Link href="/">← dashboard</Link>} />
        <div className={styles.emptyState}>
          <p>
            No repositories tracked yet.{" "}
            <Link href="/settings" className={styles.link}>
              Add one in settings
            </Link>
            .
          </p>
        </div>
      </>
    );
  }

  const repos: RepoOption[] = dbRepos.map((r) => ({ owner: r.owner, repo: r.name }));
  const labelsPerRepo: Record<string, GitHubLabel[]> = {};
  let loadError: string | undefined;

  try {
    const octokit = await getOctokit();
    const labelResults = await Promise.all(
      dbRepos.map(async (r) => {
        try {
          const labels = await listLabels(octokit, r.owner, r.name);
          return { key: `${r.owner}/${r.name}`, labels };
        } catch (err) {
          // Non-fatal — repo still selectable, just renders with no label chips.
          console.warn(
            `[issuectl] Failed to fetch labels for ${r.owner}/${r.name}:`,
            err instanceof Error ? err.message : err,
          );
          return { key: `${r.owner}/${r.name}`, labels: [] as GitHubLabel[] };
        }
      }),
    );
    for (const { key, labels } of labelResults) {
      labelsPerRepo[key] = labels;
    }
  } catch (err) {
    console.error("[issuectl] Failed to load labels:", err);
    loadError = err instanceof Error ? err.message : "Failed to connect to GitHub";
  }

  return (
    <NewIssuePage
      repos={repos}
      defaultRepo={repos[0]}
      labelsPerRepo={labelsPerRepo}
      initError={loadError}
    />
  );
}
