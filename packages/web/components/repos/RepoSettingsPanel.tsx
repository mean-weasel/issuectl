"use client";

import { useState, useTransition } from "react";
import type { LaunchAgent, Repo, WebhookPayloadMode } from "@issuectl/core";
import { removeRepo, updateRepo } from "@/lib/actions/repos";
import styles from "./RepoSettingsPanel.module.css";

export type RepoSettingsActivity = {
  activeSessions: number;
  recentCompletions: number;
  webhookEvents: number;
  prReviews: number;
};

export type RepoSettingsPanelProps = {
  repo: Repo;
  webhookUrl: string | null;
  activity: RepoSettingsActivity;
  settingsHref?: string;
};

type LabelHealth = {
  status: "idle" | "checking" | "healthy" | "missing" | "error";
  message: string;
};

type WebhookResult = {
  success: true;
  repo: Repo;
  webhook: { id: number; url: string; createdBy: string };
} | { success: false; error: string };

const REQUIRED_LABELS = ["issuectl:auto-launch", "issuectl:auto-review"];

export function RepoSettingsPanel({
  repo,
  webhookUrl,
  activity,
  settingsHref,
}: RepoSettingsPanelProps) {
  const [localPath, setLocalPath] = useState(repo.localPath ?? "");
  const [branchPattern, setBranchPattern] = useState(repo.branchPattern ?? "");
  const [autoLaunchIssues, setAutoLaunchIssues] = useState(repo.autoLaunchIssues);
  const [autoReviewPrs, setAutoReviewPrs] = useState(repo.autoReviewPrs);
  const [issueAgent, setIssueAgent] = useState<LaunchAgent>(repo.issueAgent);
  const [reviewAgent, setReviewAgent] = useState<LaunchAgent>(repo.reviewAgent);
  const [webhookPayloadMode, setWebhookPayloadMode] = useState<WebhookPayloadMode>(repo.webhookPayloadMode);
  const [webhookId, setWebhookId] = useState(repo.webhookId);
  const [labelHealth, setLabelHealth] = useState<LabelHealth>({
    status: "idle",
    message: "Not checked",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const repoPath = `${repo.owner}/${repo.name}`;
  const webhookConfigured = webhookId !== null && webhookId !== undefined;

  function saveSettings() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await updateRepo(repo.id, {
        localPath: localPath.trim() || undefined,
        branchPattern: branchPattern.trim() || undefined,
        autoLaunchIssues,
        autoReviewPrs,
        issueAgent,
        reviewAgent,
        webhookPayloadMode,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to save repo settings");
        return;
      }
      setMessage("Repo settings saved");
    });
  }

  function removeTrackedRepo() {
    const confirmed = window.confirm(`Remove ${repoPath}? Active webhook sessions may be ended.`);
    if (!confirmed) return;
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await removeRepo(repo.id);
      if (!result.success) {
        setError(result.error ?? "Failed to remove repository");
        return;
      }
      setMessage(`${repoPath} removed`);
    });
  }

  async function configureWebhook(action: "create" | "rotate") {
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/v1/repos/${repo.owner}/${repo.name}/webhook`, {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => undefined) as WebhookResult | undefined;
      if (!response.ok || !body || body.success !== true) {
        const failure = body as { error?: string } | undefined;
        throw new Error(failure?.error ?? `Webhook request failed with ${response.status}`);
      }
      setWebhookId(body.webhook.id);
      setMessage(`${action === "create" ? "Webhook installed" : "Webhook secret rotated"} by ${body.webhook.createdBy}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Webhook request failed");
    }
  }

  async function checkLabels() {
    setLabelHealth({ status: "checking", message: "Checking labels" });
    setError(null);
    try {
      const response = await fetch(`/api/v1/repos/${repo.owner}/${repo.name}/labels`, {
        method: "GET",
        headers: requestHeaders(),
      });
      const body = await response.json().catch(() => undefined) as {
        labels?: Array<{ name: string }>;
        error?: string;
      } | undefined;
      if (!response.ok) throw new Error(body?.error ?? "Label check failed");
      const names = new Set((body?.labels ?? []).map((label) => label.name));
      const missing = REQUIRED_LABELS.filter((label) => !names.has(label));
      setLabelHealth(missing.length === 0
        ? { status: "healthy", message: "Required labels are present" }
        : { status: "missing", message: `Missing ${missing.join(", ")}` });
    } catch (err) {
      setLabelHealth({
        status: "error",
        message: err instanceof Error ? err.message : "Label check failed",
      });
    }
  }

  async function recreateLabels() {
    setLabelHealth({ status: "checking", message: "Recreating labels" });
    setError(null);
    try {
      const response = await fetch(`/api/v1/repos/${repo.owner}/${repo.name}/labels`, {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify({ action: "recreate" }),
      });
      const body = await response.json().catch(() => undefined) as { success?: boolean; error?: string } | undefined;
      if (!response.ok || !body?.success) throw new Error(body?.error ?? "Label recreate failed");
      setLabelHealth({ status: "healthy", message: "Required labels recreated" });
      setMessage("Label health restored");
    } catch (err) {
      setLabelHealth({
        status: "error",
        message: err instanceof Error ? err.message : "Label recreate failed",
      });
    }
  }

  return (
    <div className={styles.shell}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Repository settings</p>
          <h1>{repoPath}</h1>
          <p>Automation, webhook, labels, activity, and removal controls for this tracked repository.</p>
        </div>
        {settingsHref && <a className={styles.secondaryButton} href={settingsHref}>All repos</a>}
      </section>

      <section className={styles.activityGrid} aria-label="Repository activity">
        <Metric label="Active" value={activity.activeSessions} />
        <Metric label="Completed" value={activity.recentCompletions} />
        <Metric label="Webhooks" value={activity.webhookEvents} />
        <Metric label="Reviews" value={activity.prReviews} />
      </section>

      <section className={styles.section} aria-label="Local defaults">
        <div>
          <h2>Local defaults</h2>
          <p>These defaults drive worktree setup and branch naming when automation starts work.</p>
        </div>
        <div className={styles.formGrid}>
          <label>
            <span>Local path</span>
            <input value={localPath} onChange={(event) => setLocalPath(event.target.value)} placeholder="~/Desktop/issuectl" />
          </label>
          <label>
            <span>Branch pattern</span>
            <input value={branchPattern} onChange={(event) => setBranchPattern(event.target.value)} placeholder="issue-{number}-{slug}" />
          </label>
        </div>
      </section>

      <section className={styles.section} aria-label="Automation">
        <div>
          <h2>Automation</h2>
          <p>Choose which GitHub events can create local sessions and which agent handles them.</p>
        </div>
        <div className={styles.toggleGrid}>
          <label>
            <input type="checkbox" checked={autoLaunchIssues} onChange={(event) => setAutoLaunchIssues(event.target.checked)} />
            <span>Auto-launch labeled issues</span>
          </label>
          <label>
            <input type="checkbox" checked={autoReviewPrs} onChange={(event) => setAutoReviewPrs(event.target.checked)} />
            <span>Auto-review labeled PRs</span>
          </label>
        </div>
        <div className={styles.formGrid}>
          <label>
            <span>Issue agent</span>
            <select value={issueAgent} onChange={(event) => setIssueAgent(event.target.value as LaunchAgent)}>
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
            </select>
          </label>
          <label>
            <span>Review agent</span>
            <select value={reviewAgent} onChange={(event) => setReviewAgent(event.target.value as LaunchAgent)}>
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
            </select>
          </label>
          <label>
            <span>Payload mode</span>
            <select value={webhookPayloadMode} onChange={(event) => setWebhookPayloadMode(event.target.value as WebhookPayloadMode)}>
              <option value="metadata">Metadata</option>
              <option value="raw">Raw payloads</option>
            </select>
          </label>
        </div>
      </section>

      <section className={styles.section} aria-label="Webhook">
        <div>
          <h2>Webhook</h2>
          <p>{webhookConfigured ? `GitHub hook ${webhookId} is stored locally.` : "No GitHub webhook id is stored locally."}</p>
        </div>
        <label>
          <span>Receiver URL</span>
          <input value={webhookUrl ?? "Set Public Webhook Base URL first"} readOnly />
        </label>
        <div className={styles.actionRow}>
          <button type="button" className={styles.secondaryButton} disabled={!webhookUrl} onClick={() => void copyWebhookUrl(webhookUrl)}>
            Copy URL
          </button>
          <button type="button" className={styles.secondaryButton} disabled={!webhookUrl} onClick={() => void configureWebhook(webhookConfigured ? "rotate" : "create")}>
            {webhookConfigured ? "Rotate secret" : "Install webhook"}
          </button>
        </div>
      </section>

      <section className={styles.section} aria-label="Label health">
        <div>
          <h2>Label health</h2>
          <p>Automation listens for `issuectl:auto-launch` and `issuectl:auto-review` labels.</p>
        </div>
        <span className={styles.statusPill} data-state={labelHealth.status}>{labelHealth.message}</span>
        <div className={styles.actionRow}>
          <button type="button" className={styles.secondaryButton} onClick={() => void checkLabels()}>
            Check labels
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => void recreateLabels()}>
            Recreate labels
          </button>
        </div>
      </section>

      <section className={styles.dangerSection} aria-label="Danger zone">
        <div>
          <h2>Danger zone</h2>
          <p>Removing a repo deletes local tracking and can end active webhook-launched sessions.</p>
        </div>
        <button type="button" className={styles.dangerButton} onClick={removeTrackedRepo} disabled={isPending}>
          Remove repository
        </button>
      </section>

      <div className={styles.stickyActions}>
        <button type="button" className={styles.primaryButton} onClick={saveSettings} disabled={isPending}>
          {isPending ? "Saving" : "Save settings"}
        </button>
        {message && <p role="status">{message}</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

async function copyWebhookUrl(value: string | null): Promise<void> {
  if (!value) return;
  await navigator.clipboard.writeText(value);
}

function requestHeaders(): Headers {
  const headers = new Headers({ Accept: "application/json", "Content-Type": "application/json" });
  const token = window.localStorage.getItem("issuectl.apiToken")
    ?? window.localStorage.getItem("issuectlApiToken");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}
