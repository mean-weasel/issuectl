import Link from "next/link";
import type { ReactNode } from "react";
import type { ReviewDetailData } from "@/lib/review-detail-data";
import styles from "./ReviewDetailPanel.module.css";

type Action = (formData: FormData) => void | Promise<void>;

type Props = {
  data: ReviewDetailData;
  retryAction: Action;
  fullRerunAction: Action;
};

export function ReviewDetailPanel({ data, retryAction, fullRerunAction }: Props) {
  return (
    <div className={styles.layout}>
      <section className={styles.main}>
        <header className={styles.summary}>
          <p>{data.repo.owner}/{data.repo.name}</p>
          <h1>PR #{data.review.prNumber} review run #{data.review.id}</h1>
          <div className={styles.chips}>
            <Chip tone={statusTone(data.review.status)}>{labelize(data.review.status)}</Chip>
            <Chip tone="accent">{triggerLabel(data.review.triggeredBy)}</Chip>
            <Chip tone="neutral">{data.review.headRef}</Chip>
          </div>
        </header>

        {data.banners.length > 0 && (
          <div className={styles.banners} aria-label="Review status banners">
            {data.banners.map((banner) => (
              <article key={banner.title} className={styles.banner} data-tone={banner.tone}>
                <strong>{banner.title}</strong>
                <p>{banner.body}</p>
              </article>
            ))}
          </div>
        )}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Lineage</h2>
            <span>{data.lineage.length} runs</span>
          </div>
          <div className={styles.timeline}>
            {data.lineage.map((run) => (
              <article key={run.id} className={styles.run} data-active={run.active ? "true" : undefined}>
                <div className={styles.rail} aria-hidden="true" />
                <div className={styles.runBody}>
                  <div className={styles.runTop}>
                    <strong>Run #{run.id}</strong>
                    <Chip tone={statusTone(run.status)}>{labelize(run.status)}</Chip>
                  </div>
                  <p>{run.label}</p>
                  <dl className={styles.facts}>
                    <div>
                      <dt>Started</dt>
                      <dd>{formatUnix(run.startedAt)}</dd>
                    </div>
                    <div>
                      <dt>Completed</dt>
                      <dd>{run.completedAt ? formatUnix(run.completedAt) : "not complete"}</dd>
                    </div>
                    <div>
                      <dt>Head</dt>
                      <dd>{shortSha(run.reviewedToSha)}</dd>
                    </div>
                    <div>
                      <dt>Trigger</dt>
                      <dd>{triggerLabel(run.triggeredBy)}</dd>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Diagnostics</h2>
            <span>{data.diagnostics.length} events</span>
          </div>
          <div className={styles.diagnostics}>
            {data.diagnostics.length === 0 && <p>No diagnostic events recorded for this PR target yet.</p>}
            {data.diagnostics.map((event) => (
              <article key={event.id} className={styles.diagnostic}>
                <strong>{event.event}</strong>
                <span>{formatUnix(Math.floor(event.timestamp / 1000))} - {event.level}</span>
                {event.message && <p>{event.message}</p>}
              </article>
            ))}
          </div>
        </section>
      </section>

      <aside className={styles.railPanel}>
        <section className={styles.card}>
          <h2>Actions</h2>
          <form action={retryAction}>
            <input type="hidden" name="reviewId" value={data.review.id} />
            <button type="submit">Retry review</button>
          </form>
          <form action={fullRerunAction}>
            <input type="hidden" name="reviewId" value={data.review.id} />
            <button type="submit">Full rerun</button>
          </form>
        </section>

        <section className={styles.card}>
          <h2>Run details</h2>
          <dl className={styles.sideFacts}>
            <div>
              <dt>Base</dt>
              <dd>{shortSha(data.review.reviewBaseSha)}</dd>
            </div>
            <div>
              <dt>Range</dt>
              <dd>{data.review.reviewedFromSha ? `${shortSha(data.review.reviewedFromSha)}..${shortSha(data.review.reviewedToSha)}` : `full ${shortSha(data.review.reviewedToSha)}`}</dd>
            </div>
            <div>
              <dt>Head repo</dt>
              <dd>{data.review.headRepoFullName}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>{data.deployment ? `#${data.deployment.id}` : "none linked"}</dd>
            </div>
            <div>
              <dt>Terminal</dt>
              <dd>{data.deployment?.terminalReason ? labelize(data.deployment.terminalReason) : "not recorded"}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.card}>
          <h2>Links</h2>
          <div className={styles.links}>
            <a href={data.links.githubPr}>GitHub PR</a>
            <Link href={data.links.workbench}>Workbench</Link>
            <Link href={data.links.sessions}>Sessions list</Link>
            <Link href={data.links.repoSettings}>Repo settings</Link>
          </div>
        </section>

        <section className={styles.card}>
          <h2>CLI hint</h2>
          <code>{data.links.diagnosticsCli}</code>
        </section>
      </aside>
    </div>
  );
}

function Chip({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={styles.chip} data-tone={tone}>{children}</span>;
}

function statusTone(status: string): string {
  if (status === "completed") return "good";
  if (status === "failed") return "bad";
  if (status === "superseded") return "warn";
  return "accent";
}

function triggerLabel(trigger: string): string {
  return trigger === "comment_command" ? "comment" : trigger;
}

function labelize(value: string): string {
  return value.replaceAll("_", " ");
}

function shortSha(value: string): string {
  return value.slice(0, 7);
}

function formatUnix(value: number): string {
  return new Date(value * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
