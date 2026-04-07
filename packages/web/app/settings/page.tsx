import {
  getDb,
  dbExists,
  listRepos,
  getSettings,
  checkGhAuth,
} from "@issuectl/core";
import { PageHeader } from "@/components/ui/PageHeader";
import { TrackedRepos } from "@/components/settings/TrackedRepos";
import { DefaultsForm } from "@/components/settings/DefaultsForm";
import { TerminalSettings } from "@/components/settings/TerminalSettings";
import { AuthStatus } from "@/components/settings/AuthStatus";
import { WorktreeCleanup } from "@/components/settings/WorktreeCleanup";
import { listWorktrees } from "@/lib/actions/worktrees";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!dbExists()) {
    return (
      <>
        <PageHeader title="Settings" />
        <div className={styles.content}>
          <p style={{ color: "var(--text-secondary)" }}>
            Run <code>issuectl init</code> to get started.
          </p>
        </div>
      </>
    );
  }

  const db = getDb();
  const repos = listRepos(db);
  const settings = getSettings(db);

  const settingMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const branchPattern = settingMap.branch_pattern ?? "issue-{number}-{slug}";
  const cacheTTL = settingMap.cache_ttl ?? "300";
  const terminalApp = settingMap.terminal_app ?? "ghostty";
  const terminalMode = settingMap.terminal_mode ?? "window";

  const [authResult, worktrees] = await Promise.all([
    checkGhAuth().catch(() => ({ ok: false, username: undefined })),
    listWorktrees(),
  ]);
  const username = authResult.username ?? null;

  return (
    <>
      <PageHeader title="Settings" />
      <div className={styles.content}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Tracked Repositories</div>
          <TrackedRepos repos={repos} />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Defaults</div>
          <DefaultsForm
            branchPattern={branchPattern}
            cacheTTL={cacheTTL}
          />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Terminal</div>
          <TerminalSettings
            terminalApp={terminalApp}
            terminalMode={terminalMode}
          />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Worktrees</div>
          <WorktreeCleanup worktrees={worktrees} />
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Authentication</div>
          <AuthStatus username={username} />
        </section>
      </div>
    </>
  );
}
