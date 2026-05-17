import type { WorkbenchIssueSummary, WorkbenchRepo } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type Props = {
  repos: WorkbenchRepo[];
  onSelectIssue: (repoId: number, issueNumber: number) => void;
};

export function GlobalIssuesFocus({ repos, onSelectIssue }: Props) {
  const totalIssues = repos.reduce((count, repo) => count + repo.issues.length, 0);

  return (
    <div className={styles.focusInner}>
      <p className={styles.kicker}>Issues</p>
      <h1>Global issues</h1>
      <p className={styles.muted}>
        {totalIssues === 0
          ? "No matching issues."
          : `${totalIssues} issues across ${repos.length} tracked repositories.`}
      </p>
      <div aria-label="Global issues">
        {repos.map((repo) => (
          <section key={repo.id} aria-label={`Issues for ${repo.owner}/${repo.name}`}>
            <h2>{repo.owner}/{repo.name}</h2>
            {repo.issues.length === 0 ? (
              <p className={styles.muted}>No matching issues.</p>
            ) : (
              <div className={styles.issueList}>
                {repo.issues.map((issue) => (
                  <GlobalIssueRow
                    key={issue.number}
                    issue={issue}
                    repo={repo}
                    onSelectIssue={onSelectIssue}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function GlobalIssueRow({
  issue,
  repo,
  onSelectIssue,
}: {
  issue: WorkbenchIssueSummary;
  repo: WorkbenchRepo;
  onSelectIssue: (repoId: number, issueNumber: number) => void;
}) {
  const status = issue.state === "closed" ? "closed" : issue.hasActiveDeployment ? "running" : "open";

  return (
    <article
      className={styles.issueCard}
      data-status={status}
      aria-label={`${repo.owner}/${repo.name} issue #${issue.number}`}
    >
      <div className={styles.issueCardHead}>
        <strong>#{issue.number}</strong>
        <span>{status}</span>
        <span>{issue.priority}</span>
      </div>
      <h3>{issue.title}</h3>
      <p>{repo.owner}/{repo.name}</p>
      <div className={styles.issueActions}>
        <button type="button" onClick={() => onSelectIssue(repo.id, issue.number)}>
          Open issue
        </button>
      </div>
    </article>
  );
}
