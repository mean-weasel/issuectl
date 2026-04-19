import { Suspense } from "react";
import Link from "next/link";
import {
  getDb,
  dbExists,
  listRepos,
  getSettings,
} from "@issuectl/core";
import { PageHeader } from "@/components/ui/PageHeader";
import { TrackedRepos } from "@/components/settings/TrackedRepos";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { WorktreeSection } from "./WorktreeSection";
import { AuthSection } from "./AuthSection";
import type { Metadata } from "next";
import styles from "./page.module.css";
import { PullToRefreshWrapper } from "@/components/ui/PullToRefreshWrapper";

export const metadata: Metadata = { title: "Settings — issuectl" };
export const dynamic = "force-dynamic";

function SectionSkeleton() {
  return <div className={styles.sectionSkeleton} />;
}

export default async function SettingsPage() {
  if (!dbExists()) {
    return (
      <>
        <PageHeader title="Settings" breadcrumb={<Link href="/">← dashboard</Link>} />
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
  const windowTitle = settingMap.terminal_window_title ?? "issuectl";
  const tabTitlePattern = settingMap.terminal_tab_title_pattern ?? "#{number} — {title}";
  const claudeExtraArgs = settingMap.claude_extra_args ?? "";

  return (
    <PullToRefreshWrapper>
      <PageHeader title="Settings" breadcrumb={<Link href="/">← dashboard</Link>} />
      <div className={styles.content}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Tracked Repositories</div>
          <TrackedRepos repos={repos} />
        </section>

        <SettingsForm
          branchPattern={branchPattern}
          cacheTTL={cacheTTL}
          terminalApp={terminalApp}
          windowTitle={windowTitle}
          tabTitlePattern={tabTitlePattern}
          claudeExtraArgs={claudeExtraArgs}
        />

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Worktrees</div>
          <Suspense fallback={<SectionSkeleton />}>
            <WorktreeSection />
          </Suspense>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Authentication</div>
          <Suspense fallback={<SectionSkeleton />}>
            <AuthSection />
          </Suspense>
        </section>
      </div>
    </PullToRefreshWrapper>
  );
}
