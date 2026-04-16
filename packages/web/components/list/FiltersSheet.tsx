"use client";

import Link from "next/link";
import { repoKey } from "@issuectl/core";
import { Sheet } from "@/components/paper";
import { REPO_COLORS } from "@/lib/constants";
import styles from "./FiltersSheet.module.css";

type Repo = { owner: string; name: string };

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
}: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Filters">
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
    </Sheet>
  );
}
