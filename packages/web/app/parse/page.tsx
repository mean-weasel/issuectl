import {
  dbExists,
  getDb,
  getOctokit,
  listRepos,
  listLabels,
  checkClaudeCliAvailable,
} from "@issuectl/core";
import type { GitHubLabel } from "@issuectl/core";
import type { RepoOption } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { ParseFlow } from "@/components/parse/ParseFlow";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function ParsePage() {
  if (!dbExists()) {
    return (
      <>
        <PageHeader title="Quick Create" />
        <div className={styles.content}>
          <p style={{ color: "var(--text-secondary)" }}>
            Run <code>issuectl init</code> to get started.
          </p>
        </div>
      </>
    );
  }

  const db = getDb();
  const dbRepos = listRepos(db);

  let repos: RepoOption[] = [];
  const labelsPerRepo: Record<string, GitHubLabel[]> = {};
  let claudeAvailable = false;

  try {
    const octokit = await getOctokit();
    repos = dbRepos.map((r) => ({ owner: r.owner, repo: r.name }));

    const [labelResults, claudeCheck] = await Promise.all([
      Promise.all(
        dbRepos.map(async (r) => {
          try {
            const labels = await listLabels(octokit, r.owner, r.name);
            return { key: `${r.owner}/${r.name}`, labels };
          } catch (err) {
            console.warn(
              `[issuectl] Failed to fetch labels for ${r.owner}/${r.name}:`,
              err instanceof Error ? err.message : err,
            );
            return { key: `${r.owner}/${r.name}`, labels: [] as GitHubLabel[] };
          }
        }),
      ),
      checkClaudeCliAvailable().catch(() => false),
    ]);

    for (const { key, labels } of labelResults) {
      labelsPerRepo[key] = labels;
    }
    claudeAvailable = claudeCheck;
  } catch (err) {
    console.error("[issuectl] Failed to load repos/labels:", err);
  }

  return (
    <>
      <PageHeader title="Quick Create" />
      <div className={styles.content}>
        <ParseFlow
          repos={repos}
          labelsPerRepo={labelsPerRepo}
          claudeAvailable={claudeAvailable}
        />
      </div>
    </>
  );
}
