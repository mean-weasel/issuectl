"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updateSettings } from "@/lib/actions/settings";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/paper";
import { cn } from "@/lib/cn";
import * as validation from "@issuectl/core/validation";
import type { SettingKey } from "@issuectl/core";
import { LAUNCH_AGENTS, launchAgentCommand, launchAgentLabel, normalizeLaunchAgent, type LaunchAgent } from "@/components/launch/agent";
import styles from "./SettingsForm.module.css";

// Save button gets an inline flash in addition to the toast: the
// toast is the global + screen-reader path, but after clicking the
// user's eyes are on the button, not the toast region.
const SAVED_FLASH_MS = 2500;

const AGENT_DETAILS: Record<LaunchAgent, string> = {
  claude: "Use Claude Code by default for new agent sessions.",
  codex: "Use Codex by default for new agent sessions.",
};

type Props = {
  branchPattern: string;
  cacheTTL: string;
  claudeExtraArgs: string;
  codexExtraArgs: string;
  launchAgent: LaunchAgent;
  idleGracePeriod: string;
  idleThreshold: string;
};

type FormValues = {
  branch_pattern: string;
  cache_ttl: string;
  claude_extra_args: string;
  codex_extra_args: string;
  launch_agent: LaunchAgent;
  idle_grace_period: string;
  idle_threshold: string;
};

type ArgsValidation = {
  ok: boolean;
  errors: readonly string[];
  warnings: readonly string[];
};

export function SettingsForm({
  branchPattern,
  cacheTTL,
  claudeExtraArgs,
  codexExtraArgs,
  launchAgent,
  idleGracePeriod,
  idleThreshold,
}: Props) {
  const initialValues: FormValues = {
    branch_pattern: branchPattern,
    cache_ttl: cacheTTL,
    claude_extra_args: claudeExtraArgs,
    codex_extra_args: codexExtraArgs,
    launch_agent: normalizeLaunchAgent(launchAgent),
    idle_grace_period: idleGracePeriod,
    idle_threshold: idleThreshold,
  };
  const [values, setValues] = useState<FormValues>(initialValues);
  const [originals, setOriginals] = useState<FormValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const isDirty = (Object.keys(originals) as (keyof FormValues)[]).some(
    (k) => values[k] !== originals[k],
  );

  // Argument validators are pure and shouldn't throw, but guard against
  // unexpected runtime errors so a bad value never crashes the form.
  let claudeArgsValidation: ArgsValidation;
  try {
    claudeArgsValidation = validation.validateClaudeArgs(values.claude_extra_args);
  } catch (err) {
    console.error("[issuectl] validateClaudeArgs threw unexpectedly", err);
    claudeArgsValidation = {
      ok: false,
      errors: ["Could not validate input (internal error). Try reloading the page."],
      warnings: [],
    };
  }

  const validateCodexArgs: ((input: string) => ArgsValidation) | undefined =
    "validateCodexArgs" in validation && typeof validation.validateCodexArgs === "function"
      ? (validation.validateCodexArgs as (input: string) => ArgsValidation)
      : undefined;
  const codexArgsValidation = validateCodexArgs
    ? (() => {
        try {
          return validateCodexArgs(values.codex_extra_args);
        } catch (err) {
          console.error("[issuectl] validateCodexArgs threw unexpectedly", err);
          return {
            ok: false,
            errors: ["Could not validate input (internal error). Try reloading the page."],
            warnings: [],
          };
        }
      })()
    : { ok: true, errors: [], warnings: [] };

  const hasBlockingError = !claudeArgsValidation.ok || !codexArgsValidation.ok;
  const hasWarnings =
    claudeArgsValidation.warnings.length > 0 ||
    codexArgsValidation.warnings.length > 0;

  function handleChange(key: keyof FormValues, value: string | LaunchAgent) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    setError(null);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    startTransition(async () => {
      const changed = (Object.keys(originals) as (keyof FormValues)[]).filter(
        (k) => values[k] !== originals[k],
      );
      if (changed.length === 0) {
        // Unreachable: the Save button is `disabled={!isDirty}` so a
        // click without any dirty fields means the disabled-button
        // invariant has drifted. Log loudly rather than silently no-op
        // (which would also wipe a stale ✓ Saved flash on screen).
        console.warn(
          "[issuectl] SettingsForm.handleSave: clicked with no dirty fields — disabled-button invariant broken",
        );
        return;
      }

      const updates: Partial<Record<SettingKey, string>> = {};
      for (const key of changed) {
        updates[key as SettingKey] = values[key];
      }

      const result = await updateSettings(updates);
      if (!result.success) {
        setError(result.error ?? "Failed to save settings");
        return;
      }

      // Reset the baseline so isDirty correctly reflects the saved
      // state — without this, subsequent edits always appear dirty.
      setOriginals({ ...values });

      if (result.cacheStale) {
        showToast("Settings saved — reload to see updates", "success");
      } else {
        showToast("Settings saved", "success");
      }
      setSavedFlash(true);
      flashTimerRef.current = setTimeout(
        () => setSavedFlash(false),
        SAVED_FLASH_MS,
      );
    });
  }

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionTitle}>Defaults</div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="sf-branch-pattern">Branch Pattern</label>
            <input
              id="sf-branch-pattern"
              className={styles.input}
              value={values.branch_pattern}
              onChange={(e) => handleChange("branch_pattern", e.target.value)}
              disabled={isPending}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="sf-cache-ttl">Cache TTL (seconds)</label>
            <input
              id="sf-cache-ttl"
              className={styles.input}
              value={values.cache_ttl}
              onChange={(e) => handleChange("cache_ttl", e.target.value)}
              disabled={isPending}
              autoComplete="off"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="done"
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Agent Harness</div>
        <div className={styles.helpBlock}>
          Choose the default agentic harness for launches. You can still override
          the agent from the launch dialog for a single session.
        </div>
        <div className={styles.agentOptions} role="radiogroup" aria-labelledby="sf-launch-agent-label">
          <div id="sf-launch-agent-label" className={styles.label}>Default Agent</div>
          {LAUNCH_AGENTS.map((agent) => {
            const isSelected = values.launch_agent === agent;
            return (
              <label
                key={agent}
                className={cn(
                  styles.agentOption,
                  isSelected && styles.agentOptionSelected,
                  isPending && styles.agentOptionDisabled,
                )}
              >
                <input
                  type="radio"
                  name="sf-launch-agent"
                  className={styles.agentRadio}
                  checked={isSelected}
                  disabled={isPending}
                  onChange={() => handleChange("launch_agent", agent)}
                />
                <span>
                  <span className={styles.agentLabel}>{launchAgentLabel(agent)}</span>
                  <span className={styles.agentDetail}>{AGENT_DETAILS[agent]}</span>
                </span>
              </label>
            );
          })}
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="sf-claude-args">Claude Extra Args</label>
            <input
              id="sf-claude-args"
              className={styles.input}
              value={values.claude_extra_args}
              onChange={(e) => handleChange("claude_extra_args", e.target.value)}
              disabled={isPending}
              placeholder="--dangerously-skip-permissions"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
            />
            <div className={styles.help}>
              Passed verbatim after <code>{launchAgentCommand("claude")}</code> when launching Claude Code.
              Leave empty for defaults.
            </div>
            {claudeArgsValidation.errors.length > 0 && (
              <div className={styles.fieldError} role="alert">
                {claudeArgsValidation.errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
            {claudeArgsValidation.errors.length === 0 &&
              claudeArgsValidation.warnings.length > 0 && (
                <div className={styles.fieldWarning}>
                  {claudeArgsValidation.warnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </div>
              )}
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="sf-codex-args">Codex Extra Args</label>
            <input
              id="sf-codex-args"
              className={styles.input}
              value={values.codex_extra_args}
              onChange={(e) => handleChange("codex_extra_args", e.target.value)}
              disabled={isPending}
              placeholder="--model gpt-5"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
            />
            <div className={styles.help}>
              Passed verbatim after <code>{launchAgentCommand("codex")}</code> when launching Codex.
              Leave empty for defaults.
            </div>
            {codexArgsValidation.errors.length > 0 && (
              <div className={styles.fieldError} role="alert">
                {codexArgsValidation.errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
            {codexArgsValidation.errors.length === 0 &&
              codexArgsValidation.warnings.length > 0 && (
                <div className={styles.fieldWarning}>
                  {codexArgsValidation.warnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </div>
              )}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Terminal Idle Detection</div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="sf-idle-grace">Grace Period (seconds)</label>
            <input
              id="sf-idle-grace"
              className={styles.input}
              value={values.idle_grace_period}
              onChange={(e) => handleChange("idle_grace_period", e.target.value)}
              disabled={isPending}
              autoComplete="off"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="done"
            />
            <div className={styles.help}>
              Seconds after launch before idle detection begins. Default 300 (5 min).
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="sf-idle-threshold">Idle Threshold (seconds)</label>
            <input
              id="sf-idle-threshold"
              className={styles.input}
              value={values.idle_threshold}
              onChange={(e) => handleChange("idle_threshold", e.target.value)}
              disabled={isPending}
              autoComplete="off"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="done"
            />
            <div className={styles.help}>
              Seconds of no terminal output before marking idle. Default 300 (5 min).
            </div>
          </div>
        </div>
      </section>

      <div className={styles.saveRow}>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={isPending || !isDirty || hasBlockingError}
        >
          {isPending
            ? "Saving..."
            : hasWarnings && isDirty
              ? "Save with warnings"
              : "Save Settings"}
        </Button>
        {savedFlash && !isPending && (
          <span className={styles.savedFlash} aria-hidden="true">
            ✓ Saved
          </span>
        )}
        {error && <span className={styles.error} role="alert">{error}</span>}
      </div>
    </>
  );
}
