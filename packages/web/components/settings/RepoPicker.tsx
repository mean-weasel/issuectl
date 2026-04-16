"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { repoKey, type GitHubAccessibleRepo } from "@issuectl/core";
import {
  getGithubReposAction,
  refreshGithubReposAction,
} from "@/lib/actions/repos";
import styles from "./RepoPicker.module.css";

type Props = {
  trackedSet: Set<string>;
  disabled?: boolean;
  onSelect: (owner: string, name: string) => void;
  onManualEntry: () => void;
};

function formatAgo(syncedAt: number | null): string {
  if (syncedAt === null) return "never synced";
  const diff = Math.floor(Date.now() / 1000) - syncedAt;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function RepoPicker({ trackedSet, disabled, onSelect, onManualEntry }: Props) {
  const [repos, setRepos] = useState<GitHubAccessibleRepo[]>([]);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  // Decomposed the previous 4-ary `phase` union into two orthogonal
  // booleans + a latest-error string. `ready && error` (stale data + recent
  // refresh failure) is now expressed naturally instead of via a workaround.
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    (async () => {
      const read = await getGithubReposAction();
      if (cancelledRef.current) return;

      if (!read.success) {
        setError(read.error);
        setIsRefreshing(false);
        setInitialLoadDone(true);
        return;
      }

      setRepos(read.snapshot.repos);
      setSyncedAt(read.snapshot.syncedAt);
      setInitialLoadDone(true);

      const needsFetch =
        read.snapshot.repos.length === 0 || read.snapshot.isStale;
      if (!needsFetch) {
        setIsRefreshing(false);
        return;
      }

      const fresh = await refreshGithubReposAction();
      if (cancelledRef.current) return;
      if (fresh.success) {
        setRepos(fresh.snapshot.repos);
        setSyncedAt(fresh.snapshot.syncedAt);
        setError(null);
      } else {
        setError(fresh.error);
      }
      setIsRefreshing(false);
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    // Don't auto-focus on touch devices — doing so pops the on-screen
    // keyboard the moment the picker opens, which competes with the user's
    // intent to scroll the list first. Desktop still gets autofocus.
    if (!initialLoadDone) return;
    const isPointer = window.matchMedia("(hover: hover)").matches;
    if (isPointer) searchRef.current?.focus();
  }, [initialLoadDone]);

  async function handleRefresh() {
    setIsRefreshing(true);
    setError(null);
    const fresh = await refreshGithubReposAction();
    if (cancelledRef.current) return;
    if (fresh.success) {
      setRepos(fresh.snapshot.repos);
      setSyncedAt(fresh.snapshot.syncedAt);
    } else {
      setError(fresh.error);
    }
    setIsRefreshing(false);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.owner.toLowerCase().includes(q) ||
        repoKey(r).toLowerCase().includes(q),
    );
  }, [repos, query]);

  const isBusy = isRefreshing || disabled;
  const showInitialLoading = !initialLoadDone && isRefreshing;
  const showHardError = error !== null && repos.length === 0;

  return (
    <div className={styles.picker}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>
          {isRefreshing ? "refreshing…" : `updated ${formatAgo(syncedAt)}`}
        </span>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={handleRefresh}
          disabled={isBusy}
          aria-label="Refresh repository list"
          title="Refresh repository list"
        >
          <span className={isRefreshing ? styles.refreshIconSpin : styles.refreshIcon}>
            ↻
          </span>
        </button>
      </div>

      <input
        ref={searchRef}
        className={styles.search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="search your repos…"
        disabled={disabled || showInitialLoading}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        aria-label="Search repositories"
      />

      <div className={styles.list} role="listbox">
        {showInitialLoading && <div className={styles.status}>loading repos…</div>}
        {showHardError && error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}
        {!showInitialLoading && !showHardError && filtered.length === 0 && (
          <div className={styles.status}>
            {query ? "no matches — try manual entry below" : "no repos found"}
          </div>
        )}
        {!showInitialLoading &&
          filtered.map((repo) => {
            const key = repoKey(repo);
            const tracked = trackedSet.has(key);
            return (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={false}
                className={tracked ? styles.itemTracked : styles.item}
                onClick={() => !tracked && onSelect(repo.owner, repo.name)}
                disabled={tracked || disabled}
              >
                <span className={styles.dot} />
                <span className={styles.name}>
                  <span className={styles.owner}>{repo.owner}/</span>
                  {repo.name}
                </span>
                {tracked ? (
                  <span className={styles.badge}>already tracked</span>
                ) : repo.private ? (
                  <span className={styles.badgePrivate}>private</span>
                ) : null}
              </button>
            );
          })}
      </div>

      {!showHardError && error && (
        <div className={styles.inlineError} role="alert">
          refresh failed: {error}
        </div>
      )}

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.manualLink}
          onClick={onManualEntry}
          disabled={disabled}
        >
          Can&rsquo;t find it? Enter manually &rarr;
        </button>
      </div>
    </div>
  );
}
