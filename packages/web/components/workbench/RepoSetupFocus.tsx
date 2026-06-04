/* eslint-disable max-lines */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { WorkbenchRepo, WorkbenchSettings } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type GitHubRepo = {
  owner: string;
  name: string;
  private?: boolean;
};

type Props = {
  repos: WorkbenchRepo[];
  selectedRepo: WorkbenchRepo | null;
  settings: WorkbenchSettings;
  onRepoUpdated: (repo: WorkbenchRepo) => void;
  onRepoAdded: (repo: WorkbenchRepo) => void;
  onRepoRemoved: (owner: string, name: string) => void;
};

export function RepoSetupFocus({
  repos,
  selectedRepo,
  settings,
  onRepoUpdated,
  onRepoAdded,
  onRepoRemoved,
}: Props) {
  const editableRepo = selectedRepo ?? repos[0] ?? null;
  const [localPath, setLocalPath] = useState(editableRepo?.localPath ?? "");
  const [branchPattern, setBranchPattern] = useState(editableRepo?.branchPattern ?? "");
  const [autoLaunchIssues, setAutoLaunchIssues] = useState(editableRepo?.autoLaunchIssues ?? false);
  const [autoReviewPrs, setAutoReviewPrs] = useState(editableRepo?.autoReviewPrs ?? false);
  const [issueAgent, setIssueAgent] = useState(editableRepo?.issueAgent ?? "codex");
  const [reviewAgent, setReviewAgent] = useState(editableRepo?.reviewAgent ?? "claude");
  const [webhookPayloadMode, setWebhookPayloadMode] = useState(editableRepo?.webhookPayloadMode ?? "metadata");
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [selectedAddKey, setSelectedAddKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLocalPath(editableRepo?.localPath ?? "");
    setBranchPattern(editableRepo?.branchPattern ?? "");
    setAutoLaunchIssues(editableRepo?.autoLaunchIssues ?? false);
    setAutoReviewPrs(editableRepo?.autoReviewPrs ?? false);
    setIssueAgent(editableRepo?.issueAgent ?? "codex");
    setReviewAgent(editableRepo?.reviewAgent ?? "claude");
    setWebhookPayloadMode(editableRepo?.webhookPayloadMode ?? "metadata");
  }, [
    editableRepo?.id,
    editableRepo?.localPath,
    editableRepo?.branchPattern,
    editableRepo?.autoLaunchIssues,
    editableRepo?.autoReviewPrs,
    editableRepo?.issueAgent,
    editableRepo?.reviewAgent,
    editableRepo?.webhookPayloadMode,
  ]);

  useEffect(() => {
    void refreshGithubRepos();
  }, []);

  const tracked = useMemo(
    () => new Set(repos.map((repo) => `${repo.owner}/${repo.name}`)),
    [repos],
  );
  const addableRepos = githubRepos.filter((repo) => !tracked.has(`${repo.owner}/${repo.name}`));
  const selectedAddRepo = addableRepos.find((repo) => `${repo.owner}/${repo.name}` === selectedAddKey)
    ?? addableRepos[0]
    ?? null;
  const webhookUrl = editableRepo
    ? formatWebhookUrl(settings.public_webhook_base_url, editableRepo.id)
    : null;

  async function refreshGithubRepos() {
    setError(null);
    setBusy(true);
    try {
      const body = await requestJson<{ repos?: GitHubRepo[]; error?: string }>(
        "/api/v1/repos/github?refresh=true",
        { method: "GET" },
      );
      setGithubRepos(body.repos ?? []);
      setStatus("Repository picker refreshed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh repositories");
    } finally {
      setBusy(false);
    }
  }

  async function saveRepoSetup() {
    if (!editableRepo) return;
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const body = await requestJson<{ repo: WorkbenchRepo }>(
        `/api/v1/repos/${editableRepo.owner}/${editableRepo.name}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            localPath: localPath.trim(),
            branchPattern: branchPattern.trim(),
            autoLaunchIssues,
            autoReviewPrs,
            issueAgent,
            reviewAgent,
            webhookPayloadMode,
          }),
        },
      );
      onRepoUpdated({ ...editableRepo, ...body.repo });
      setStatus("Repo setup saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save repo setup");
    } finally {
      setBusy(false);
    }
  }

  async function addSelectedRepo() {
    if (!selectedAddRepo) return;
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const body = await requestJson<{ repo: WorkbenchRepo }>(
        "/api/v1/repos",
        {
          method: "POST",
          body: JSON.stringify({
            owner: selectedAddRepo.owner,
            name: selectedAddRepo.name,
          }),
        },
      );
      onRepoAdded(normalizeAddedRepo(body.repo));
      setStatus(`${selectedAddRepo.owner}/${selectedAddRepo.name} added`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add repository");
    } finally {
      setBusy(false);
    }
  }

  async function removeRepo() {
    if (!editableRepo) return;
    const confirmed = window.confirm(
      `Remove ${editableRepo.owner}/${editableRepo.name} from issuectl tracking? GitHub data is not deleted.`,
    );
    if (!confirmed) return;
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      await requestJson<{ success: true }>(`/api/v1/repos/${editableRepo.owner}/${editableRepo.name}`, {
        method: "DELETE",
      });
      onRepoRemoved(editableRepo.owner, editableRepo.name);
      setStatus(`${editableRepo.owner}/${editableRepo.name} removed`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove repository");
    } finally {
      setBusy(false);
    }
  }

  async function copyWebhookUrl() {
    if (!webhookUrl) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setStatus("Webhook URL copied");
    } catch {
      setError("Unable to copy webhook URL");
    }
  }

  async function configureWebhook(action: "create" | "rotate") {
    if (!editableRepo) return;
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const body = await requestJson<{ repo: WorkbenchRepo; webhook: { id: number; url: string; createdBy: string } }>(
        `/api/v1/repos/${editableRepo.owner}/${editableRepo.name}/webhook`,
        {
          method: "POST",
          body: JSON.stringify({ action }),
        },
      );
      onRepoUpdated({ ...editableRepo, ...body.repo });
      setStatus(`${action === "create" ? "Webhook created" : "Webhook secret rotated"} by ${body.webhook.createdBy}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to ${action} webhook`);
    } finally {
      setBusy(false);
    }
  }

  const webhookConfigured = editableRepo?.webhookId !== null && editableRepo?.webhookId !== undefined;

  return (
    <div className={styles.focusInner}>
      <p className={styles.kicker}>Repo setup</p>
      <h1>{editableRepo ? `${editableRepo.owner}/${editableRepo.name}` : "Add repository"}</h1>
      <p className={styles.muted}>
        Configure local checkout defaults and add accessible GitHub repositories to the workbench.
      </p>
      {editableRepo && (
        <p className={styles.muted}>
          <Link href={`/repos/${editableRepo.owner}/${editableRepo.name}/settings`}>
            Open full repo settings
          </Link>
        </p>
      )}

      {editableRepo && (
        <section aria-label="Repository settings" style={sectionStyle}>
          <h2 style={headingStyle}>Local defaults</h2>
          <label style={fieldStyle}>
            <span>Local path</span>
            <input
              value={localPath}
              onChange={(event) => setLocalPath(event.target.value)}
              aria-label="Local path"
              style={inputStyle}
              autoComplete="off"
            />
          </label>
          <label style={fieldStyle}>
            <span>Branch pattern</span>
            <input
              value={branchPattern}
              onChange={(event) => setBranchPattern(event.target.value)}
              aria-label="Branch pattern"
              style={inputStyle}
              autoComplete="off"
            />
          </label>

          <h2 style={headingStyle}>Webhook automation</h2>
          <div style={checkboxGridStyle}>
            <label style={checkboxFieldStyle}>
              <input
                type="checkbox"
                checked={autoLaunchIssues}
                onChange={(event) => setAutoLaunchIssues(event.target.checked)}
              />
              <span>Auto-launch issues</span>
            </label>
            <label style={checkboxFieldStyle}>
              <input
                type="checkbox"
                checked={autoReviewPrs}
                onChange={(event) => setAutoReviewPrs(event.target.checked)}
              />
              <span>Auto-review PRs</span>
            </label>
          </div>
          <div style={selectGridStyle}>
            <label style={fieldStyle}>
              <span>Issue agent</span>
              <select
                value={issueAgent}
                onChange={(event) => setIssueAgent(event.target.value as typeof issueAgent)}
                aria-label="Issue agent"
                style={inputStyle}
              >
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
              </select>
            </label>
            <label style={fieldStyle}>
              <span>Review agent</span>
              <select
                value={reviewAgent}
                onChange={(event) => setReviewAgent(event.target.value as typeof reviewAgent)}
                aria-label="Review agent"
                style={inputStyle}
              >
                <option value="claude">Claude</option>
                <option value="codex">Codex</option>
              </select>
            </label>
            <label style={fieldStyle}>
              <span>Payload mode</span>
              <select
                value={webhookPayloadMode}
                onChange={(event) => setWebhookPayloadMode(event.target.value as typeof webhookPayloadMode)}
                aria-label="Payload mode"
                style={inputStyle}
              >
                <option value="metadata">Metadata</option>
                <option value="raw">Raw, dashboard redacted</option>
              </select>
            </label>
          </div>
          <label style={fieldStyle}>
            <span>GitHub webhook URL</span>
            <input
              value={webhookUrl ?? "Set Public Webhook Base URL in Settings"}
              aria-label="GitHub webhook URL"
              style={inputStyle}
              readOnly
            />
          </label>
          <p style={helperStyle}>
            {webhookConfigured ? `GitHub webhook id ${editableRepo?.webhookId}` : "No GitHub webhook id stored"}
          </p>
          <div className={styles.emptyActions}>
            <button type="button" className={styles.primaryButton} onClick={saveRepoSetup} disabled={busy}>
              Save repo setup
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={copyWebhookUrl}
              disabled={busy || !webhookUrl}
            >
              Copy webhook URL
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => configureWebhook(webhookConfigured ? "rotate" : "create")}
              disabled={busy || !webhookUrl}
            >
              {webhookConfigured ? "Rotate webhook secret" : "Create GitHub webhook"}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={removeRepo} disabled={busy}>
              Remove repository
            </button>
          </div>
        </section>
      )}

      <section aria-label="Accessible GitHub repositories" style={sectionStyle}>
        <h2 style={headingStyle}>Accessible GitHub repos</h2>
        <div className={styles.emptyActions}>
          <button type="button" className={styles.secondaryButton} onClick={refreshGithubRepos} disabled={busy}>
            Refresh GitHub repos
          </button>
        </div>
        <label style={fieldStyle}>
          <span>Repository picker</span>
          <select
            aria-label="Repository picker"
            value={selectedAddRepo ? `${selectedAddRepo.owner}/${selectedAddRepo.name}` : ""}
            onChange={(event) => setSelectedAddKey(event.target.value)}
            style={inputStyle}
            disabled={busy || addableRepos.length === 0}
          >
            {addableRepos.length === 0 && <option value="">No untracked repos</option>}
            {addableRepos.map((repo) => (
              <option key={`${repo.owner}/${repo.name}`} value={`${repo.owner}/${repo.name}`}>
                {repo.owner}/{repo.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={styles.primaryButton} onClick={addSelectedRepo} disabled={busy || !selectedAddRepo}>
          Add selected repo
        </button>
      </section>

      {status && <p role="status" style={statusStyle}>{status}</p>}
      {error && <p role="alert" style={errorStyle}>{error}</p>}
    </div>
  );
}

function normalizeAddedRepo(repo: WorkbenchRepo): WorkbenchRepo {
  return {
    ...repo,
    badgeCount: repo.badgeCount ?? 0,
    deployedCount: repo.deployedCount ?? 0,
    launchAgent: repo.launchAgent ?? null,
    autoLaunchIssues: repo.autoLaunchIssues ?? false,
    autoReviewPrs: repo.autoReviewPrs ?? false,
    issueAgent: repo.issueAgent ?? "codex",
    reviewAgent: repo.reviewAgent ?? "claude",
    webhookId: repo.webhookId ?? null,
    webhookPayloadMode: repo.webhookPayloadMode ?? "metadata",
    issueError: repo.issueError ?? null,
    issuesFromCache: repo.issuesFromCache ?? false,
    issuesCachedAt: repo.issuesCachedAt ?? null,
    priorities: repo.priorities ?? [],
    deployments: repo.deployments ?? [],
    recentCompletions: repo.recentCompletions ?? [],
    webhookEvents: repo.webhookEvents ?? [],
    prReviews: repo.prReviews ?? [],
    previews: repo.previews ?? {},
    issues: repo.issues ?? [],
  };
}

function formatWebhookUrl(baseUrl: string | undefined, repoId: number): string | null {
  const trimmed = baseUrl?.trim();
  if (!trimmed) return null;
  return `${trimmed.replace(/\/$/, "")}/api/webhook/github/${repoId}`;
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const token = readApiToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(path, { ...init, headers });
  const body = await response.json().catch(() => undefined) as { error?: string } | undefined;
  if (!response.ok) {
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }
  return body as T;
}

function readApiToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("issuectl.apiToken")
    ?? window.localStorage.getItem("issuectlApiToken");
}

const sectionStyle = {
  display: "grid",
  gap: 12,
  marginTop: 22,
  padding: 16,
  border: "1px solid var(--paper-line)",
  borderRadius: "var(--paper-radius-md)",
  background: "rgba(255, 255, 255, 0.2)",
} satisfies CSSProperties;

const headingStyle = {
  fontFamily: "var(--paper-serif)",
  fontSize: 20,
  fontWeight: 500,
} satisfies CSSProperties;

const fieldStyle = {
  display: "grid",
  gap: 6,
  color: "var(--paper-ink-muted)",
  font: "700 10px var(--paper-mono)",
  textTransform: "uppercase",
} satisfies CSSProperties;

const checkboxGridStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
} satisfies CSSProperties;

const checkboxFieldStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "var(--paper-ink)",
  font: "13px var(--paper-serif)",
} satisfies CSSProperties;

const selectGridStyle = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
} satisfies CSSProperties;

const helperStyle = {
  margin: 0,
  color: "var(--paper-ink-muted)",
  font: "12px var(--paper-serif)",
} satisfies CSSProperties;

const inputStyle = {
  minHeight: 38,
  padding: "0 10px",
  border: "1px solid var(--paper-line)",
  borderRadius: "var(--paper-radius-sm)",
  background: "rgba(255, 255, 255, 0.28)",
  color: "var(--paper-ink)",
  font: "13px var(--paper-serif)",
  textTransform: "none",
} satisfies CSSProperties;

const statusStyle = {
  marginTop: 14,
  color: "var(--paper-accent)",
} satisfies CSSProperties;

const errorStyle = {
  marginTop: 14,
  color: "#9f1d12",
} satisfies CSSProperties;
