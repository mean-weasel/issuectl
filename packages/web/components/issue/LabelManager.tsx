"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GitHubLabel } from "@issuectl/core";
import { toggleLabel, togglePullLabel } from "@/lib/actions/issues";
import { tryOrQueue } from "@/lib/tryOrQueue";
import { separateLabels } from "@/lib/labels";
import { useToast } from "@/components/ui/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { SyncDot } from "@/components/ui/SyncDot";
import type { WebhookAutomationHealth } from "@/lib/webhook-health";
import { LabelSelector } from "./LabelSelector";
import styles from "./LabelManager.module.css";

const MIN_SYNC_DOT_MS = 1500;

type Props = {
  owner: string;
  repo: string;
  issueNumber: number;
  targetType?: "issue" | "pr";
  currentLabels: GitHubLabel[];
  availableLabels: GitHubLabel[];
  webhookHealth?: WebhookAutomationHealth | null;
};

export function LabelManager({
  owner,
  repo,
  issueNumber,
  targetType = "issue",
  currentLabels,
  availableLabels,
  webhookHealth,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [syncVisible, setSyncVisible] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveWebhookHealth, setLiveWebhookHealth] = useState<WebhookAutomationHealth | null | undefined>(webhookHealth);
  const [webhookCheckError, setWebhookCheckError] = useState<string | null>(null);
  const [isCheckingWebhook, setIsCheckingWebhook] = useState(false);
  const syncStartRef = useRef(0);

  // Keep the syncing dot visible for at least one full pulse cycle (1.2s
  // animation in SyncDot.module.css). The 1500ms buffer prevents mid-fade
  // disappearance when the API responds faster than one cycle.
  useEffect(() => {
    if (isPending) {
      syncStartRef.current = Date.now();
      setSyncVisible(true);
      return;
    }
    if (!syncVisible) return;
    const elapsed = Date.now() - syncStartRef.current;
    const remaining = Math.max(0, MIN_SYNC_DOT_MS - elapsed);
    const timer = setTimeout(() => setSyncVisible(false), remaining);
    return () => clearTimeout(timer);
  }, [isPending]); // syncVisible intentionally omitted — it's a gate, not a reactive dep

  useEffect(() => {
    setLiveWebhookHealth(webhookHealth);
  }, [webhookHealth]);

  const { lifecycle: lifecycleLabels, regular: regularLabels } =
    separateLabels(currentLabels);
  const selectedNames = currentLabels.map((l) => l.name);
  const automationLabel = targetType === "pr" ? "issuectl:auto-review" : "issuectl:auto-launch";
  const currentWebhookHealth = liveWebhookHealth ?? webhookHealth ?? null;
  const hasAutomationLabel = selectedNames.includes(automationLabel)
    || availableLabels.some((label) => label.name === automationLabel);
  const showWebhookHealth = hasAutomationLabel
    && (showSelector || currentWebhookHealth?.state !== "ok" || webhookCheckError !== null);

  async function refreshWebhookHealth(): Promise<{
    health: WebhookAutomationHealth | null;
    error: string | null;
  }> {
    setIsCheckingWebhook(true);
    setWebhookCheckError(null);
    try {
      const response = await fetch(`/api/v1/repos/${owner}/${repo}/webhook/health`, {
        method: "GET",
        headers: requestHeaders(),
      });
      const body = await response.json().catch(() => undefined) as {
        health?: WebhookAutomationHealth | null;
        error?: string;
      } | undefined;
      if (!response.ok) throw new Error(body?.error ?? "Webhook delivery check failed");
      const health = body?.health ?? null;
      setLiveWebhookHealth(health);
      return { health, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Webhook delivery check failed";
      setWebhookCheckError(message);
      return { health: null, error: message };
    } finally {
      setIsCheckingWebhook(false);
    }
  }

  async function confirmAutomationLabelPreflight(): Promise<boolean> {
    const result = await refreshWebhookHealth();
    if (result.health?.state === "ok") return true;
    const reason = result.health
      ? `${result.health.summary}. ${result.health.detail}`
      : `Webhook delivery health could not be checked. ${result.error ?? "The receiver state is unknown."}`;
    return window.confirm(`${reason}\n\nThis is webhook delivery infrastructure, not an issuectl launch failure. Continue applying ${automationLabel} anyway?`);
  }

  function handleToggle(label: string) {
    setError(null);
    const action = selectedNames.includes(label) ? "remove" : "add";
    startTransition(async () => {
      try {
        if (label === automationLabel && action === "add") {
          const ok = await confirmAutomationLabelPreflight();
          if (!ok) return;
        }

        if (targetType === "issue") {
          const result = await tryOrQueue(
            "toggleLabel",
            { owner, repo, issueNumber, label, action },
            () => toggleLabel({ owner, repo, number: issueNumber, label, action }),
          );

          if (result.outcome === "queued") {
            showToast("Label change queued — will sync when online", "warning");
            return;
          }

          if (result.outcome === "error") {
            setError(result.error);
            return;
          }
        } else {
          const result = await togglePullLabel({ owner, repo, number: issueNumber, label, action });
          if (!result.success) {
            setError(result.error ?? "Failed to update label");
            return;
          }
        }

        showToast("Labels updated", "success");
        router.refresh();
      } catch (err) {
        console.error("[issuectl] toggleLabel threw:", err);
        setError(err instanceof Error ? err.message : "Failed to update label");
      }
    });
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Labels</span>
        {syncVisible && <SyncDot status="syncing" label="syncing labels" />}
        <button
          type="button"
          className={styles.editButton}
          onClick={() => setShowSelector((s) => !s)}
        >
          {showSelector ? "Done" : "Edit"}
        </button>
      </div>

      {regularLabels.length > 0 && (
        <div className={styles.labels}>
          {regularLabels.map((l) => (
            <Badge key={l.name} label={l.name} color={l.color} />
          ))}
        </div>
      )}

      {lifecycleLabels.length > 0 && (
        <div className={styles.labels}>
          {lifecycleLabels.map((l) => (
            <Badge key={l.name} label={l.name} color={l.color} />
          ))}
        </div>
      )}

      {regularLabels.length === 0 && lifecycleLabels.length === 0 && !showSelector && (
        <span className={styles.empty}>No labels</span>
      )}

      {showWebhookHealth && (
        <AutomationHealthNotice
          health={currentWebhookHealth}
          targetType={targetType}
          checkError={webhookCheckError}
          isChecking={isCheckingWebhook}
          onCheck={() => void refreshWebhookHealth()}
        />
      )}

      {showSelector && (
        <div className={styles.selector}>
          <LabelSelector
            available={availableLabels}
            selected={selectedNames}
            onToggle={handleToggle}
            targetType={targetType}
            disabled={isPending}
          />
        </div>
      )}

      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function AutomationHealthNotice({
  health,
  targetType,
  checkError,
  isChecking,
  onCheck,
}: {
  health: WebhookAutomationHealth | null;
  targetType: "issue" | "pr";
  checkError: string | null;
  isChecking: boolean;
  onCheck: () => void;
}) {
  const label = targetType === "pr" ? "auto-review" : "auto-launch";
  const state = health?.state ?? "unknown";
  return (
    <div className={styles.automationHealth} data-state={state} role={state === "ok" ? "status" : "alert"}>
      <strong>{health?.summary ?? "Webhook delivery health has not been checked"}</strong>
      <span>
        {label} labels rely on the GitHub webhook reaching this machine. {health?.detail ?? "Run a delivery check before applying the automation label."}
      </span>
      {health?.latestDelivery && (
        <code>
          latest: {health.latestDelivery.event ?? "delivery"}
          {health.latestDelivery.action ? `.${health.latestDelivery.action}` : ""} · {health.latestDelivery.statusCode ?? "unknown"}
        </code>
      )}
      {health?.recovery && <span>{health.recovery}</span>}
      {checkError && <span>{checkError}</span>}
      <button type="button" className={styles.checkButton} onClick={onCheck} disabled={isChecking}>
        {isChecking ? "Checking delivery" : "Check delivery"}
      </button>
    </div>
  );
}

function requestHeaders(): Headers {
  const headers = new Headers({ Accept: "application/json", "Content-Type": "application/json" });
  const token = window.localStorage.getItem("issuectl.apiToken")
    ?? window.localStorage.getItem("issuectlApiToken");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}
