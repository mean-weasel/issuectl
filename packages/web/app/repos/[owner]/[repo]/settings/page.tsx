import Link from "next/link";
import { notFound } from "next/navigation";
import {
  dbExists,
  getActiveDeployments,
  getDb,
  getRepo,
  getSetting,
  listPrReviewsForRepo,
  listRecentTerminalDeploymentsByRepo,
  listWebhookEvents,
} from "@issuectl/core";
import { PageHeader } from "@/components/ui/PageHeader";
import { RepoSettingsPanel } from "@/components/repos/RepoSettingsPanel";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Repo settings - issuectl" };

export default async function RepoSettingsPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo: repoName } = await params;
  if (!dbExists()) {
    return (
      <>
        <PageHeader title="Repo settings" breadcrumb={<Link href="/settings/repos">repos</Link>} />
        <main className={styles.empty}>
          Run <code>issuectl init</code> to create the local database.
        </main>
      </>
    );
  }

  const db = getDb();
  const repo = getRepo(db, owner, repoName);
  if (!repo) notFound();

  const publicWebhookBaseUrl = getSetting(db, "public_webhook_base_url");
  const webhookUrl = publicWebhookBaseUrl
    ? `${publicWebhookBaseUrl.replace(/\/$/, "")}/api/webhook/github/${repo.id}`
    : null;
  const activeSessions = getActiveDeployments(db).filter((deployment) => deployment.repoId === repo.id).length;
  const activity = {
    activeSessions,
    recentCompletions: listRecentTerminalDeploymentsByRepo(db, repo.id, 25).length,
    webhookEvents: listWebhookEvents(db, { repoId: repo.id, limit: 25 }).length,
    prReviews: listPrReviewsForRepo(db, repo.id, 25).length,
  };

  return (
    <>
      <PageHeader title={`${repo.owner}/${repo.name}`} breadcrumb={<Link href="/settings/repos">repos</Link>} />
      <main className={styles.shell}>
        <RepoSettingsPanel
          repo={repo}
          webhookUrl={webhookUrl}
          activity={activity}
          settingsHref="/settings/repos"
        />
      </main>
    </>
  );
}
