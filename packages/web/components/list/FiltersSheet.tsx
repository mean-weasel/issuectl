"use client";

import Link from "next/link";
import type { Section, SortMode } from "@issuectl/core";
import { Sheet } from "@/components/paper";
import { REPO_COLORS } from "@/lib/constants";
import { repoKey } from "@/lib/repo-key";
import styles from "./FiltersSheet.module.css";

type Repo = { owner: string; name: string };

const SECTIONS = [
  "unassigned",
  "open",
  "running",
  "closed",
] as const satisfies readonly Section[];

const SORT_OPTIONS: { mode: SortMode; label: string }[] = [
  { mode: "updated", label: "Last updated" },
  { mode: "created", label: "Date created" },
  { mode: "priority", label: "Priority" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  repos: Repo[];
  activeRepo: string | null;
  showAuthor: boolean;
  mineOnly: boolean;
  username: string | null;
  repoHref: (repoKey: string | null) => string;
  mineHref: (mine: boolean | null) => string;
  clearHref: string | null;
  showSort: boolean;
  activeSort: SortMode;
  sortHref: (sort: SortMode) => string;
  // Command sheet sections (mobile only)
  activeTab: "issues" | "prs";
  tabHref: (tab: "issues" | "prs") => string;
  activeSection: Section;
  sectionHref: (section: Section) => string;
  sectionCounts: Record<Section, number | null> | null;
  onCreateDraft: () => void;
};

export function FiltersSheet({
  open,
  onClose,
  repos,
  activeRepo,
  showAuthor,
  mineOnly,
  username,
  repoHref,
  mineHref,
  clearHref,
  showSort,
  activeSort,
  sortHref,
  activeTab,
  tabHref,
  activeSection,
  sectionHref,
  sectionCounts,
  onCreateDraft,
}: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Filters">
      {/* ── Mobile command sections ── */}
      <div className={styles.mobileOnly}>
        {/* View toggle: Issues / PRs */}
        <div className={styles.commandSection}>
          <span className={styles.commandLabel}>view</span>
          <div className={styles.viewToggle}>
            <Link
              href={tabHref("issues")}
              className={`${styles.viewOption} ${activeTab === "issues" ? styles.viewOptionActive : ""}`}
              onClick={onClose}
            >
              Issues
            </Link>
            <Link
              href={tabHref("prs")}
              className={`${styles.viewOption} ${activeTab === "prs" ? styles.viewOptionActive : ""}`}
              onClick={onClose}
            >
              PRs
            </Link>
          </div>
        </div>

        {/* Section chips: drafts / open / running / closed (issues only) */}
        {activeTab === "issues" && (
          <div className={styles.commandSection}>
            <span className={styles.commandLabel}>section</span>
            <div className={styles.sectionChips}>
              {SECTIONS.map(
                (section) => (
                  <Link
                    key={section}
                    href={sectionHref(section)}
                    className={`${styles.sectionChip} ${section === activeSection ? styles.sectionChipActive : ""}`}
                    onClick={onClose}
                  >
                    {section === "unassigned" ? "drafts" : section}
                    {sectionCounts !== null && sectionCounts[section] !== null && (
                      <span className={styles.sectionChipCount}>
                        {sectionCounts[section]}
                      </span>
                    )}
                  </Link>
                ),
              )}
            </div>
          </div>
        )}
      </div>

      <div className={styles.clearBar}>
        {clearHref ? (
          <Link
            href={clearHref}
            className={styles.clearBtn}
            onClick={onClose}
          >
            clear all
          </Link>
        ) : (
          <span className={styles.clearPlaceholder} />
        )}
      </div>

      <div className={styles.groupLabel}>Repository</div>
      <Link
        href={repoHref(null)}
        className={activeRepo === null ? styles.rowActive : styles.row}
        onClick={onClose}
      >
        <span className={styles.label}>All repos</span>
        {activeRepo === null && <span className={styles.check}>✓</span>}
      </Link>
      {repos.map((repo, i) => {
        const key = repoKey(repo);
        const isActive = key === activeRepo;
        const color = REPO_COLORS[i % REPO_COLORS.length];
        return (
          <Link
            key={key}
            href={repoHref(key)}
            className={isActive ? styles.rowActive : styles.row}
            onClick={onClose}
          >
            <span
              className={styles.dot}
              style={{ background: color }}
              aria-hidden
            />
            <span className={styles.label}>
              <span className={styles.labelOwner}>{repo.owner}/</span>
              {repo.name}
            </span>
            {isActive && <span className={styles.check}>✓</span>}
          </Link>
        );
      })}

      {showAuthor && (
        <>
          <div className={styles.groupLabel}>Author</div>
          <Link
            href={mineHref(null)}
            className={!mineOnly ? styles.rowActive : styles.row}
            onClick={onClose}
          >
            <span className={styles.label}>Everyone</span>
            {!mineOnly && <span className={styles.check}>✓</span>}
          </Link>
          <Link
            href={mineHref(true)}
            className={mineOnly ? styles.rowActive : styles.row}
            onClick={onClose}
          >
            <span className={styles.label}>
              Just me
              {username && (
                <span className={styles.labelSub}> (@{username})</span>
              )}
            </span>
            {mineOnly && <span className={styles.check}>✓</span>}
          </Link>
        </>
      )}

      {showSort && (
        <>
          <div className={styles.groupLabel}>Sort by</div>
          {SORT_OPTIONS.map(({ mode, label }) => {
            const isActive = mode === activeSort;
            return (
              <Link
                key={mode}
                href={sortHref(mode)}
                className={isActive ? styles.rowActive : styles.row}
                onClick={onClose}
              >
                <span className={styles.label}>{label}</span>
                {isActive && <span className={styles.check}>✓</span>}
              </Link>
            );
          })}
        </>
      )}

      {/* ── Mobile action links ── */}
      <div className={styles.mobileOnly}>
        <div className={styles.commandDivider} />

        <button
          className={styles.commandLink}
          onClick={() => {
            onClose();
            onCreateDraft();
          }}
        >
          <span className={styles.commandLinkIcon}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3v12M3 9h12" />
            </svg>
          </span>
          <span className={styles.commandLinkText}>
            Create Draft
            <span className={styles.commandLinkDesc}>start a new issue draft</span>
          </span>
        </button>

        <Link href="/?section=open&launch=next" className={styles.commandLink} onClick={onClose}>
          <span className={`${styles.commandLinkIcon} ${styles.claudeIcon}`}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M3 14l2-2M5 12l4-8M9 4l4 8M13 12l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="9" cy="4" r="1.5" fill="currentColor" />
              <circle cx="5" cy="12" r="1" fill="currentColor" />
              <circle cx="13" cy="12" r="1" fill="currentColor" />
            </svg>
          </span>
          <span className={styles.commandLinkText}>
            Launch Claude Code
            <span className={styles.commandLinkDesc}>start a session on an open issue</span>
          </span>
        </Link>

        <Link href="/parse" className={styles.commandLink} onClick={onClose}>
          <span className={styles.commandLinkIcon}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 3l2 2-8 8H5v-2l8-8z" />
            </svg>
          </span>
          <span className={styles.commandLinkText}>
            Quick Create
            <span className={styles.commandLinkDesc}>paste a GitHub URL to create an issue</span>
          </span>
        </Link>

        <Link href="/settings" className={styles.commandLink} onClick={onClose}>
          <span className={styles.commandLinkIcon}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="9" r="3" />
              <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.3 3.3l1.4 1.4M13.3 13.3l1.4 1.4M3.3 14.7l1.4-1.4M13.3 4.7l1.4-1.4" />
            </svg>
          </span>
          <span className={styles.commandLinkText}>
            Settings
            <span className={styles.commandLinkDesc}>repos, tokens, preferences</span>
          </span>
        </Link>

        <span className={styles.version}>
          v{process.env.NEXT_PUBLIC_APP_VERSION || "dev"}
        </span>
      </div>
    </Sheet>
  );
}
