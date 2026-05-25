/* eslint-disable max-lines */
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LaunchAgent, WebhookPayloadMode } from "@issuectl/core";
import { addRepo } from "@/lib/actions/repos";
import { Button } from "@/components/paper";
import { useToast } from "@/components/ui/ToastProvider";
import { RepoPicker } from "./RepoPicker";
import styles from "./AddRepoForm.module.css";

type Props = {
  onClose: () => void;
  trackedSet: Set<string>;
};

type RepoIdentity = { owner: string; name: string };

type WizardStep = "identify" | "automation" | "install";

type AutomationState = {
  autoLaunchIssues: boolean;
  autoReviewPrs: boolean;
  issueAgent: LaunchAgent;
  reviewAgent: LaunchAgent;
  webhookPayloadMode: WebhookPayloadMode;
};

type InstallState = "idle" | "running" | "done" | "warning" | "skipped" | "failed";

type FormMode =
  | { kind: "picker" }
  | { kind: "selected"; repo: RepoIdentity }
  | { kind: "manual"; input: string };

const DEFAULT_AUTOMATION: AutomationState = {
  autoLaunchIssues: true,
  autoReviewPrs: true,
  issueAgent: "codex",
  reviewAgent: "codex",
  webhookPayloadMode: "metadata",
};

function parseManual(input: string): RepoIdentity | null {
  const parts = input.trim().split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], name: parts[1] };
}

function repoKey(repo: RepoIdentity): string {
  return `${repo.owner}/${repo.name}`;
}

export function AddRepoForm({ onClose, trackedSet }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [step, setStep] = useState<WizardStep>("identify");
  const [formMode, setFormMode] = useState<FormMode>({ kind: "picker" });
  const [localPath, setLocalPath] = useState("");
  const [automation, setAutomation] = useState<AutomationState>(DEFAULT_AUTOMATION);
  const [addedRepo, setAddedRepo] = useState<RepoIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [installState, setInstallState] = useState<Record<string, InstallState>>({
    secret: "idle",
    webhook: "idle",
    labels: "idle",
    ping: "idle",
  });
  const [isPending, startTransition] = useTransition();

  const target = useMemo(() => {
    if (formMode.kind === "manual") return parseManual(formMode.input);
    if (formMode.kind === "selected") return formMode.repo;
    return null;
  }, [formMode]);

  const settingsHref = target
    ? `/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.name)}/settings`
    : "/settings/repos";
  const dashboardHref = target
    ? `/?repo=${encodeURIComponent(repoKey(target))}`
    : "/";

  function updateAutomation(updates: Partial<AutomationState>) {
    setAutomation((current) => ({ ...current, ...updates }));
  }

  function handleNext() {
    setError(null);
    if (step === "identify") {
      if (!target) {
        setError("Format: owner/repo (e.g., mean-weasel/seatify)");
        return;
      }
      if (trackedSet.has(repoKey(target))) {
        setError(`${repoKey(target)} is already tracked`);
        return;
      }
      setStep("automation");
      return;
    }
    if (step === "automation") {
      setStep("install");
    }
  }

  function handleSubmit() {
    setError(null);
    setWarning(null);
    if (!target) {
      setError("Format: owner/repo (e.g., mean-weasel/seatify)");
      setStep("identify");
      return;
    }

    setInstallState({
      secret: "running",
      webhook: "running",
      labels: "running",
      ping: "running",
    });
    startTransition(async () => {
      const result = await addRepo(
        target.owner,
        target.name,
        localPath.trim() || undefined,
        { ...automation, installWebhook: true },
      );
      if (!result.success) {
        setInstallState({ secret: "idle", webhook: "idle", labels: "idle", ping: "idle" });
        setError(result.error);
        return;
      }
      setAddedRepo(result.addedRepo);
      setWarning(result.warning ?? null);
      setInstallState({
        secret: result.install.webhook === "skipped" ? "skipped" : "done",
        webhook: result.install.webhook === "installed" ? "done" : result.install.webhook,
        labels: result.install.labels.length > 0 ? "done" : "skipped",
        ping: result.install.firstPing === "received" ? "done" : result.install.firstPing === "timeout" ? "warning" : "skipped",
      });
      showToast("Repository added", "success");
    });
  }

  const canAdvanceIdentify =
    !isPending &&
    (formMode.kind === "manual"
      ? formMode.input.trim().length > 0
      : formMode.kind === "selected");
  const canSubmit = !isPending && step === "install" && Boolean(target) && !addedRepo;

  return (
    <div className={styles.form}>
      <div className={styles.steps} aria-label="Add repository progress">
        {(["identify", "automation", "install"] as const).map((item, index) => (
          <button
            key={item}
            type="button"
            className={`${styles.step} ${step === item ? styles.stepActive : ""}`}
            onClick={() => setStep(item)}
            disabled={isPending || (item !== "identify" && !target)}
            aria-current={step === item ? "step" : undefined}
          >
            <span className={styles.stepIndex}>{index + 1}</span>
            <span className={styles.stepLabel}>
              {item === "identify" ? "Identify" : item === "automation" ? "Automation" : "Install"}
            </span>
          </button>
        ))}
      </div>

      {step === "identify" && (
        <div className={styles.panel}>
          <div className={styles.row}>
            <div className={styles.field}>
              <div className={styles.label}>Repository</div>

              {formMode.kind === "picker" && (
                <RepoPicker
                  trackedSet={trackedSet}
                  disabled={isPending}
                  onSelect={(owner, name) =>
                    setFormMode({ kind: "selected", repo: { owner, name } })
                  }
                  onManualEntry={() => setFormMode({ kind: "manual", input: "" })}
                />
              )}

              {formMode.kind === "selected" && (
                <div className={styles.selected}>
                  <span className={styles.selectedDot} />
                  <span className={styles.selectedName}>
                    {formMode.repo.owner}/{formMode.repo.name}
                  </span>
                  <button
                    type="button"
                    className={styles.selectedChange}
                    onClick={() => setFormMode({ kind: "picker" })}
                    disabled={isPending}
                  >
                    change
                  </button>
                </div>
              )}

              {formMode.kind === "manual" && (
                <div className={styles.manual}>
                  <input
                    className={styles.input}
                    value={formMode.input}
                    onChange={(event) =>
                      setFormMode({ kind: "manual", input: event.target.value })
                    }
                    placeholder="owner/repo (e.g., mean-weasel/seatify)"
                    disabled={isPending}
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="done"
                  />
                  <button
                    type="button"
                    className={styles.backLink}
                    onClick={() => setFormMode({ kind: "picker" })}
                    disabled={isPending}
                  >
                    back to picker
                  </button>
                </div>
              )}
            </div>

            <div className={styles.field}>
              <div className={styles.label}>Local Path</div>
              <input
                className={styles.input}
                value={localPath}
                onChange={(event) => setLocalPath(event.target.value)}
                placeholder="~/Desktop/my-repo"
                disabled={isPending}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className={styles.pathHint}>Optional. Leave blank to prompt on launch.</div>
            </div>
          </div>
        </div>
      )}

      {step === "automation" && (
        <div className={styles.panel}>
          <div className={styles.automationGrid}>
            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={automation.autoLaunchIssues}
                onChange={(event) =>
                  updateAutomation({ autoLaunchIssues: event.target.checked })
                }
                disabled={isPending}
              />
              <span>
                <strong>Issue sessions</strong>
                <small>Launch a session when labeled issues arrive.</small>
              </span>
            </label>
            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={automation.autoReviewPrs}
                onChange={(event) =>
                  updateAutomation({ autoReviewPrs: event.target.checked })
                }
                disabled={isPending}
              />
              <span>
                <strong>PR reviews</strong>
                <small>Reserve opened PRs for review sessions.</small>
              </span>
            </label>
          </div>

          <div className={styles.row}>
            <label className={styles.field}>
              <div className={styles.label}>Issue Agent</div>
              <select
                className={styles.input}
                value={automation.issueAgent}
                onChange={(event) =>
                  updateAutomation({ issueAgent: event.target.value as LaunchAgent })
                }
                disabled={isPending || !automation.autoLaunchIssues}
              >
                <option value="codex">Codex</option>
                <option value="claude">Claude</option>
              </select>
            </label>
            <label className={styles.field}>
              <div className={styles.label}>Review Agent</div>
              <select
                className={styles.input}
                value={automation.reviewAgent}
                onChange={(event) =>
                  updateAutomation({ reviewAgent: event.target.value as LaunchAgent })
                }
                disabled={isPending || !automation.autoReviewPrs}
              >
                <option value="codex">Codex</option>
                <option value="claude">Claude</option>
              </select>
            </label>
            <label className={styles.field}>
              <div className={styles.label}>Payload</div>
              <select
                className={styles.input}
                value={automation.webhookPayloadMode}
                onChange={(event) =>
                  updateAutomation({ webhookPayloadMode: event.target.value as WebhookPayloadMode })
                }
                disabled={isPending}
              >
                <option value="metadata">Metadata</option>
                <option value="raw">Raw</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {step === "install" && (
        <div className={styles.panel}>
          <div className={styles.summary}>
            <div>
              <div className={styles.label}>Repository</div>
              <strong>{target ? repoKey(target) : "Select a repository"}</strong>
            </div>
            <div>
              <div className={styles.label}>Automation</div>
              <span>
                {automation.autoLaunchIssues ? "Issues on" : "Issues off"} ·{" "}
                {automation.autoReviewPrs ? "PRs on" : "PRs off"} ·{" "}
                {automation.webhookPayloadMode}
              </span>
            </div>
          </div>

          <div className={styles.installPane} aria-live="polite">
            <InstallRow label="Generating secret" state={installState.secret} />
            <InstallRow label="Installing webhook" state={installState.webhook} />
            <InstallRow label="Creating automation labels" state={installState.labels} />
            <InstallRow label="Waiting for first delivery" state={installState.ping} />
          </div>

          {addedRepo && (
            <div className={styles.postAddActions}>
              <Button
                variant="primary"
                onClick={() => router.push(settingsHref)}
              >
                Open repo settings
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  onClose();
                  router.push(dashboardHref);
                }}
              >
                Open dashboard
              </Button>
            </div>
          )}
        </div>
      )}

      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
      {warning && (
        <span className={styles.warning} role="status">
          {warning}
        </span>
      )}

      {!addedRepo && (
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          {step !== "identify" && (
            <Button
              variant="ghost"
              onClick={() => setStep(step === "install" ? "automation" : "identify")}
              disabled={isPending}
            >
              Back
            </Button>
          )}
          {step === "install" ? (
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {isPending ? "Adding..." : "Add repo"}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleNext}
              disabled={step === "identify" ? !canAdvanceIdentify : isPending}
            >
              Next
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function InstallRow({ label, state }: { label: string; state: InstallState }) {
  return (
    <div className={styles.installRow}>
      <span className={`${styles.installDot} ${styles[`installDot_${state}`]}`} />
      <span>{label}</span>
      <strong>{state === "idle" ? "pending" : state}</strong>
    </div>
  );
}
