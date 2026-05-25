import Link from "next/link";
import type { ReactNode } from "react";
import type {
  ReviewPrGroup,
  SessionTargetGroup,
  SessionsFilters,
  SessionsOverviewData,
  SessionsTab,
} from "@/lib/sessions-data";
import styles from "./SessionsReviewList.module.css";

type Props = {
  data: SessionsOverviewData;
};

const TABS: Array<{ id: SessionsTab; label: string }> = [
  { id: "sessions", label: "Sessions" },
  { id: "reviews", label: "Reviews" },
];

export function SessionsReviewList({ data }: Props) {
  const { filters } = data;
  return (
    <div className={styles.stack}>
      <section className={styles.summary} aria-label="Sessions and reviews summary">
        <Metric label="Active sessions" value={data.summary.activeSessions} />
        <Metric label="Recently ended" value={data.summary.endedSessions} />
        <Metric label="Review runs" value={data.summary.reviewRuns} />
        <Metric label="Active reviews" value={data.summary.activeReviewRuns} />
      </section>

      <nav className={styles.tabs} aria-label="Sessions view">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            className={styles.tab}
            data-active={filters.tab === tab.id ? "true" : undefined}
            href={filterHref(filters, { tab: tab.id })}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <Filters data={data} />

      {!data.initialized && (
        <section className={styles.empty}>
          <h2>No local database</h2>
          <p>Run <code>issuectl init</code> before reviewing session and PR review history.</p>
        </section>
      )}

      {data.initialized && filters.tab === "sessions" && (
        <SessionGroups groups={data.sessionGroups} />
      )}
      {data.initialized && filters.tab === "reviews" && (
        <ReviewGroups groups={data.reviewGroups} />
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.metric}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Filters({ data }: Props) {
  const { filters } = data;
  return (
    <form className={styles.filters} action="/sessions">
      <input type="hidden" name="tab" value={filters.tab} />
      <label className={styles.searchBox}>
        <span>Search</span>
        <input name="q" defaultValue={filters.q} placeholder="repo, branch, target, SHA" />
      </label>

      <label>
        <span>Repo</span>
        <select name="repo" defaultValue={filters.repo}>
          <option value="">All repos</option>
          {data.repos.map((repo) => (
            <option key={repo.id} value={repo.fullName}>{repo.fullName}</option>
          ))}
        </select>
      </label>

      <label>
        <span>Trigger</span>
        <select name="trigger" defaultValue={filters.trigger}>
          <option value="all">All triggers</option>
          <option value="manual">Manual</option>
          <option value="webhook">Webhook</option>
          <option value="comment_command">Comment</option>
        </select>
      </label>

      {filters.tab === "sessions" ? (
        <label>
          <span>State</span>
          <select name="state" defaultValue={filters.state}>
            <option value="all">All states</option>
            <option value="active">Active</option>
            <option value="ended">Ended</option>
          </select>
        </label>
      ) : (
        <label>
          <span>Status</span>
          <select name="status" defaultValue={filters.status}>
            <option value="all">All statuses</option>
            <option value="reserved">Reserved</option>
            <option value="launching">Launching</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="superseded">Superseded</option>
          </select>
        </label>
      )}

      <button type="submit">Apply</button>
      <Link className={styles.resetLink} href="/sessions">Reset</Link>
    </form>
  );
}

function SessionGroups({ groups }: { groups: SessionTargetGroup[] }) {
  if (groups.length === 0) {
    return (
      <section className={styles.empty}>
        <h2>No sessions match</h2>
        <p>Try a wider repo, trigger, state, or search filter.</p>
      </section>
    );
  }

  return (
    <section className={styles.groups} aria-label="Session groups">
      {groups.map((group) => (
        <article key={group.key} className={styles.group}>
          <header className={styles.groupHeader}>
            <div>
              <p>{group.repoFullName}</p>
              <h2>{group.targetLabel}</h2>
            </div>
            <Link className={styles.linkButton} href={`/workbench?repo=${encodeURIComponent(group.repoFullName)}`}>
              Workbench
            </Link>
          </header>
          <div className={styles.rows}>
            {group.sessions.map((session) => (
              <div key={session.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>{session.branchName}</span>
                  <span className={styles.rowMeta}>
                    {session.agent} - {session.workspaceMode} - launched {formatDateTime(session.launchedAt)}
                  </span>
                  <span className={styles.preview}>{session.preview?.lines.join(" ") || session.workspacePath}</span>
                </div>
                <div className={styles.chips}>
                  <Chip tone={session.endedAt ? "neutral" : "good"}>{session.endedAt ? "ended" : "active"}</Chip>
                  <Chip tone="accent" title={triggerTitle(session.triggeredBy)}>{triggerLabel(session.triggeredBy)}</Chip>
                  {session.terminalReason && <Chip tone="warn">{labelize(session.terminalReason)}</Chip>}
                  {session.linkedPrNumber && <Chip tone="neutral">PR #{session.linkedPrNumber}</Chip>}
                  {session.parentDeploymentId && <Chip tone="neutral">parent #{session.parentDeploymentId}</Chip>}
                  {session.childDeploymentCount > 0 && <Chip tone="accent">{session.childDeploymentCount} child</Chip>}
                  {session.webhookDepth > 0 && <Chip tone="neutral">depth {session.webhookDepth}</Chip>}
                </div>
                <div className={styles.rowLinks}>
                  <a href={githubTargetHref(session.owner, session.repoName, session.targetType, session.targetNumber)}>
                    GitHub
                  </a>
                  <Link href={`/repos/${session.owner}/${session.repoName}/settings`}>Repo settings</Link>
                </div>
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function ReviewGroups({ groups }: { groups: ReviewPrGroup[] }) {
  if (groups.length === 0) {
    return (
      <section className={styles.empty}>
        <h2>No review runs match</h2>
        <p>Try a wider repo, trigger, status, or search filter.</p>
      </section>
    );
  }

  return (
    <section className={styles.groups} aria-label="PR review groups">
      {groups.map((group) => (
        <article key={group.key} className={styles.group}>
          <header className={styles.groupHeader}>
            <div>
              <p>{group.repoFullName}</p>
              <h2>PR #{group.prNumber}</h2>
            </div>
            <a className={styles.linkButton} href={githubTargetHref(group.owner, group.repoName, "pr", group.prNumber)}>
              GitHub PR
            </a>
          </header>
          <div className={styles.timeline}>
            {group.runs.map((run) => (
              <Link
                key={run.id}
                className={styles.reviewRun}
                data-status={run.status}
                href={run.detailHref}
                aria-label={`Open PR #${run.prNumber} review run #${run.id}`}
              >
                <div className={styles.runRail} aria-hidden="true" />
                <div className={styles.rowMain}>
                  <span className={styles.rowTitle}>Run #{run.id}</span>
                  <span className={styles.rowMeta}>
                    {formatUnix(run.startedAt)} - {run.headRepoFullName}:{run.headRef}
                  </span>
                  <span className={styles.preview}>
                    {run.rangeLabel}
                    {run.summary ? ` - ${run.summary}` : ""}
                    {run.deployment ? ` - session ${run.deployment.id}` : ""}
                  </span>
                </div>
                <div className={styles.chips}>
                  <Chip tone={reviewTone(run.status)}>{labelize(run.status)}</Chip>
                  <Chip tone="accent" title={triggerTitle(run.triggeredBy)}>{triggerLabel(run.triggeredBy)}</Chip>
                  {run.findingCount !== null && <Chip tone={run.findingCount > 0 ? "warn" : "good"}>{run.findingCount} findings</Chip>}
                  {run.completedAt && <Chip tone="neutral">done {formatUnix(run.completedAt)}</Chip>}
                </div>
              </Link>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function Chip({ children, tone, title }: { children: ReactNode; tone: string; title?: string }) {
  return <span className={styles.chip} data-tone={tone} title={title}>{children}</span>;
}

function filterHref(filters: SessionsFilters, next: Partial<SessionsFilters>): string {
  const merged = { ...filters, ...next };
  const params = new URLSearchParams();
  params.set("tab", merged.tab);
  if (merged.q) params.set("q", merged.q);
  if (merged.repo) params.set("repo", merged.repo);
  if (merged.trigger !== "all") params.set("trigger", merged.trigger);
  if (merged.tab === "sessions" && merged.state !== "all") params.set("state", merged.state);
  if (merged.tab === "reviews" && merged.status !== "all") params.set("status", merged.status);
  return `/sessions?${params.toString()}`;
}

function githubTargetHref(owner: string, repo: string, targetType: "issue" | "pr", targetNumber: number): string {
  const segment = targetType === "pr" ? "pull" : "issues";
  return `https://github.com/${owner}/${repo}/${segment}/${targetNumber}`;
}

function triggerLabel(trigger: string): string {
  return trigger === "comment_command" ? "comment" : trigger;
}

function triggerTitle(trigger: string): string {
  if (trigger === "comment_command") return "Triggered by an issuectl comment command";
  if (trigger === "webhook") return "Triggered by GitHub webhook automation";
  return "Triggered manually";
}

function reviewTone(status: string): string {
  if (status === "completed") return "good";
  if (status === "failed") return "bad";
  if (status === "superseded") return "warn";
  return "accent";
}

function labelize(value: string): string {
  return value.replaceAll("_", " ");
}

function formatUnix(value: number): string {
  return new Date(value * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
