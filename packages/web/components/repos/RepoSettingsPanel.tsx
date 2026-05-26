/* eslint-disable max-lines */
"use client";

import { useState, useTransition } from "react";
import type { LaunchAgent, Repo, WebhookEvent, WebhookPayloadMode } from "@issuectl/core";
import {
  configureRepoWebhook,
  recreateRepoLabels,
  removeRepo,
  resendLastPing,
  updateRepo,
} from "@/lib/actions/repos";
import styles from "./RepoSettingsPanel.module.css";

export type RepoSettingsActivity = {
  activeSessions: number;
  activeIssueSessions: number;
  activePrSessions: number;
  recentCompletions: number;
  webhookEvents: number;
  prReviews: number;
};

export type RepoSettingsPanelProps = {
  repo: Repo;
  webhookUrl: string | null;
  activity: RepoSettingsActivity;
  recentDeliveries: WebhookEvent[];
  settingsHref?: string;
};

type LabelHealth = {
  status: "idle" | "checking" | "healthy" | "missing" | "error";
  message: string;
};

const REQUIRED_LABELS = ["issuectl:auto-launch", "issuectl:auto-review"];

export function RepoSettingsPanel({
  repo,
  webhookUrl,
  activity,
  recentDeliveries,
  settingsHref,
}: RepoSettingsPanelProps) {
  const [localPath, setLocalPath] = useState(repo.localPath ?? "");
  const [branchPattern, setBranchPattern] = useState(repo.branchPattern ?? "");
  const [autoLaunchIssues, setAutoLaunchIssues] = useState(repo.autoLaunchIssues);
  const [autoReviewPrs, setAutoReviewPrs] = useState(repo.autoReviewPrs);
  const [issueAgent, setIssueAgent] = useState<LaunchAgent>(repo.issueAgent);
  const [reviewAgent, setReviewAgent] = useState<LaunchAgent>(repo.reviewAgent);
  const [reviewPreamble, setReviewPreamble] = useState(repo.reviewPreamble ?? "");
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
  const waitingForFirstPing = webhookConfigured && activity.webhookEvents === 0;
  const healthItems = repoHealthItems({
    localPath,
    webhookConfigured,
    waitingForFirstPing,
    autoLaunchIssues,
    autoReviewPrs,
    webhookPayloadMode,
    labelHealth,
  });

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
        reviewPreamble: reviewPreamble.trim() || null,
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
    const confirmed = window.confirm(`Remove ${repoPath}? ${activity.activeSessions} active sessions may be ended and the GitHub webhook will be deleted best-effort.`);
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

  function setIssueAutomation(enabled: boolean) {
    if (!enabled && autoLaunchIssues && activity.activeIssueSessions > 0) {
      const ok = window.confirm(`This will end ${activity.activeIssueSessions} active auto-sessions for issues. Continue?`);
      if (!ok) return;
    }
    setAutoLaunchIssues(enabled);
  }

  function setPrAutomation(enabled: boolean) {
    if (!enabled && autoReviewPrs && activity.activePrSessions > 0) {
      const ok = window.confirm(`This will end ${activity.activePrSessions} active auto-sessions for PR reviews. Continue?`);
      if (!ok) return;
    }
    setAutoReviewPrs(enabled);
  }

  function runWebhookAction(action: "rotate" | "reinstall") {
    if (action === "rotate") {
      const ok = window.confirm("Rotate this webhook secret? Existing in-flight GitHub deliveries signed with the old secret may fail.");
      if (!ok) return;
    }
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await configureRepoWebhook(repo.id, action);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setWebhookId(result.webhook.id);
      const successMessage = `${action === "reinstall" ? "Webhook reinstalled" : "Webhook secret rotated"} by ${result.webhook.createdBy}`;
      setMessage(activity.webhookEvents === 0 ? `${successMessage}. Waiting for first delivery.` : successMessage);
    });
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

  function recreateLabelsWithAction() {
    setLabelHealth({ status: "checking", message: "Recreating labels" });
    setError(null);
    startTransition(async () => {
      const result = await recreateRepoLabels(repo.id);
      if (!result.success) {
        setLabelHealth({ status: "error", message: result.error });
        return;
      }
      setLabelHealth({ status: "healthy", message: "Required labels recreated" });
      setMessage("Label health restored");
    });
  }

  function resendPing() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await resendLastPing(repo.id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMessage("Webhook ping sent");
    });
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

      <section className={styles.section} aria-label="Repository health detail">
        <div>
          <h2>Status and health</h2>
          <p>{healthSummary(healthItems)}</p>
        </div>
        <div className={styles.actionRow}>
          {healthItems.map((item) => (
            <span key={item.label} className={styles.statusPill} data-state={item.state} title={item.detail}>
              {item.label}: {item.value}
            </span>
          ))}
        </div>
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
            <input type="checkbox" checked={autoLaunchIssues} onChange={(event) => setIssueAutomation(event.target.checked)} />
            <span>Auto-launch labeled issues</span>
          </label>
          <label>
            <input type="checkbox" checked={autoReviewPrs} onChange={(event) => setPrAutomation(event.target.checked)} />
            <span>Auto-review labeled PRs</span>
          </label>
        </div>
        <div className={styles.formGrid}>
          <label>
            <span>Issue agent</span>
            <select
              value={issueAgent}
              onChange={(event) => setIssueAgent(event.target.value as LaunchAgent)}
              disabled={!autoLaunchIssues || isPending}
            >
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
            </select>
          </label>
          <label>
            <span>Review agent</span>
            <select
              value={reviewAgent}
              onChange={(event) => setReviewAgent(event.target.value as LaunchAgent)}
              disabled={!autoReviewPrs || isPending}
            >
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
            </select>
          </label>
          <label>
            <span>Payload mode</span>
            <select value={webhookPayloadMode} onChange={(event) => setWebhookPayloadMode(event.target.value as WebhookPayloadMode)}>
              <option value="metadata">Metadata</option>
              <option value="raw">Raw payloads, dashboard redacted</option>
            </select>
          </label>
        </div>
        <label>
          <span>Review preamble</span>
          <textarea
            value={reviewPreamble}
            onChange={(event) => setReviewPreamble(event.target.value)}
            placeholder="Optional instructions added to PR review sessions for this repo."
            rows={4}
          />
        </label>
        {reviewPreamble !== (repo.reviewPreamble ?? "") && (
          <button type="button" className={styles.secondaryButton} onClick={() => setReviewPreamble(repo.reviewPreamble ?? "")}>
            Reset preamble
          </button>
        )}
      </section>

      <section className={styles.section} aria-label="Webhook">
        <div>
          <h2>Webhook</h2>
          <p>{webhookConfigured ? `GitHub hook ${webhookId} is stored locally.` : "No GitHub webhook id is stored locally."}</p>
          <p>Last delivery: {recentDeliveries[0] ? formatWebhookAge(recentDeliveries[0].receivedAt) : "none yet"} · 7-day success: tracked in the webhook log</p>
        </div>
        {waitingForFirstPing && (
          <div className={styles.warningPill} role="status">
            Waiting for first GitHub delivery
          </div>
        )}
        <label>
          <span>Receiver URL</span>
          <input value={webhookUrl ?? "Set Public Webhook Base URL first"} readOnly />
        </label>
        <div className={styles.actionRow}>
          <button type="button" className={styles.secondaryButton} disabled={!webhookUrl} onClick={() => void copyWebhookUrl(webhookUrl)}>
            Copy URL
          </button>
          <button type="button" className={styles.secondaryButton} disabled={!webhookUrl || isPending} onClick={() => runWebhookAction("reinstall")}>
            Reinstall webhook
          </button>
          <button type="button" className={styles.secondaryButton} disabled={!webhookConfigured || isPending} onClick={() => runWebhookAction("rotate")}>
            Rotate secret
          </button>
          <button type="button" className={styles.secondaryButton} disabled={!webhookConfigured || isPending} onClick={resendPing}>
            Re-send last ping
          </button>
        </div>
        <RecentDeliveries repo={repo} deliveries={recentDeliveries} />
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
          <button type="button" className={styles.secondaryButton} onClick={recreateLabelsWithAction}>
            Recreate labels
          </button>
        </div>
      </section>

      <section className={styles.section} aria-label="Activity links">
        <div>
          <h2>Activity</h2>
          <p>Jump to the operational views for this repository.</p>
        </div>
        <div className={styles.actionRow}>
          <a className={styles.secondaryButton} href={`/sessions?repo=${encodeURIComponent(repoPath)}`}>
            View repo sessions
          </a>
          <a className={styles.secondaryButton} href={`/logs/webhooks?repo=${repo.id}`}>
            View webhook events
          </a>
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

type HealthItem = {
  label: string;
  value: string;
  state: LabelHealth["status"];
  detail: string;
};

function repoHealthItems(input: {
  localPath: string;
  webhookConfigured: boolean;
  waitingForFirstPing: boolean;
  autoLaunchIssues: boolean;
  autoReviewPrs: boolean;
  webhookPayloadMode: WebhookPayloadMode;
  labelHealth: LabelHealth;
}): HealthItem[] {
  return [
    {
      label: "Local path",
      value: input.localPath.trim() ? "set" : "missing",
      state: input.localPath.trim() ? "healthy" : "missing",
      detail: input.localPath.trim() || "Launches will prompt for clone/path setup.",
    },
    {
      label: "Webhook",
      value: input.webhookConfigured ? input.waitingForFirstPing ? "waiting" : "configured" : "missing",
      state: input.webhookConfigured ? input.waitingForFirstPing ? "checking" : "healthy" : "missing",
      detail: input.webhookConfigured ? "A GitHub webhook id is stored locally." : "Install the webhook before automation can receive deliveries.",
    },
    {
      label: "Automation",
      value: `${input.autoLaunchIssues ? "issues on" : "issues off"}, ${input.autoReviewPrs ? "PRs on" : "PRs off"}`,
      state: input.autoLaunchIssues || input.autoReviewPrs ? "healthy" : "idle",
      detail: "Shows which GitHub labels can create sessions.",
    },
    {
      label: "Payloads",
      value: input.webhookPayloadMode === "raw" ? "raw retained, redacted UI" : "metadata only",
      state: input.webhookPayloadMode === "raw" ? "checking" : "healthy",
      detail: "Dashboard views keep retained raw payloads redacted.",
    },
    {
      label: "Labels",
      value: input.labelHealth.message,
      state: input.labelHealth.status,
      detail: "Use Check labels for a live GitHub label health read.",
    },
  ];
}

function healthSummary(items: HealthItem[]): string {
  const attention = items.filter((item) => item.state === "missing" || item.state === "error");
  if (attention.length === 0) return "No blocking repo setup gaps detected in local settings.";
  return `${attention.length} setup item${attention.length === 1 ? "" : "s"} need attention: ${attention.map((item) => item.label).join(", ")}.`;
}

function RecentDeliveries({ repo, deliveries }: { repo: Repo; deliveries: WebhookEvent[] }) {
  return (
    <details className={styles.deliveryDetails}>
      <summary>Show recent deliveries</summary>
      <div className={styles.deliveryTable}>
        {deliveries.slice(0, 10).map((event) => (
          <a
            key={event.id}
            href={`/logs/webhooks?repo=${repo.id}&delivery=${encodeURIComponent(event.deliveryId)}`}
          >
            <span>{event.eventType}{event.action ? `.${event.action}` : ""}</span>
            <code>{event.deliveryId}</code>
            <span>{formatWebhookAge(event.receivedAt)}</span>
          </a>
        ))}
        {deliveries.length === 0 && <span className={styles.deliveryEmpty}>No deliveries recorded yet.</span>}
      </div>
    </details>
  );
}

function formatWebhookAge(receivedAt: number): string {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - receivedAt) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
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
