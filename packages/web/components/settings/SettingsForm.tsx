"use client";

import { useState, useTransition } from "react";
import { updateSettings } from "@/lib/actions/settings";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/paper";
import { validateClaudeArgs } from "@issuectl/core/validation";
import type { SettingKey } from "@issuectl/core";
import styles from "./SettingsForm.module.css";

type Props = {
  branchPattern: string;
  cacheTTL: string;
  terminalApp: string;
  windowTitle: string;
  tabTitlePattern: string;
  claudeExtraArgs: string;
};

type FormValues = {
  branch_pattern: string;
  cache_ttl: string;
  terminal_window_title: string;
  terminal_tab_title_pattern: string;
  claude_extra_args: string;
};

export function SettingsForm({
  branchPattern,
  cacheTTL,
  terminalApp,
  windowTitle,
  tabTitlePattern,
  claudeExtraArgs,
}: Props) {
  const [values, setValues] = useState<FormValues>({
    branch_pattern: branchPattern,
    cache_ttl: cacheTTL,
    terminal_window_title: windowTitle,
    terminal_tab_title_pattern: tabTitlePattern,
    claude_extra_args: claudeExtraArgs,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  const originals: FormValues = {
    branch_pattern: branchPattern,
    cache_ttl: cacheTTL,
    terminal_window_title: windowTitle,
    terminal_tab_title_pattern: tabTitlePattern,
    claude_extra_args: claudeExtraArgs,
  };

  const isDirty = (Object.keys(originals) as (keyof FormValues)[]).some(
    (k) => values[k] !== originals[k],
  );

  // validateClaudeArgs is pure and shouldn't throw, but guard against
  // unexpected runtime errors so a bad value never crashes the form.
  let extraArgsValidation;
  try {
    extraArgsValidation = validateClaudeArgs(values.claude_extra_args);
  } catch (err) {
    console.error("[issuectl] validateClaudeArgs threw unexpectedly", err);
    extraArgsValidation = {
      ok: false,
      errors: ["Could not validate input (internal error). Try reloading the page."],
      warnings: [],
    };
  }
  const hasBlockingError = !extraArgsValidation.ok;
  const hasWarnings = extraArgsValidation.warnings.length > 0;

  function handleChange(key: keyof FormValues, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const changed = (Object.keys(originals) as (keyof FormValues)[]).filter(
        (k) => values[k] !== originals[k],
      );
      if (changed.length === 0) return;

      const updates: Partial<Record<SettingKey, string>> = {};
      for (const key of changed) {
        updates[key as SettingKey] = values[key];
      }

      const result = await updateSettings(updates);
      if (!result.success) {
        setError(result.error ?? "Failed to save settings");
        return;
      }

      if (result.cacheStale) {
        showToast("Settings saved — reload to see updates", "success");
      } else {
        showToast("Settings saved", "success");
      }
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
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Terminal</div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="sf-terminal-app">Application</label>
            <input
              id="sf-terminal-app"
              className={styles.inputReadonly}
              value={terminalApp}
              readOnly
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="sf-window-title">Window Title</label>
            <input
              id="sf-window-title"
              className={styles.input}
              value={values.terminal_window_title}
              onChange={(e) => handleChange("terminal_window_title", e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="sf-tab-title">Tab Title Pattern</label>
            <input
              id="sf-tab-title"
              className={styles.input}
              value={values.terminal_tab_title_pattern}
              onChange={(e) => handleChange("terminal_tab_title_pattern", e.target.value)}
              disabled={isPending}
            />
            <div className={styles.help}>
              Placeholders: {"{number}"}, {"{title}"}, {"{repo}"}, {"{owner}"}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Claude</div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="sf-claude-args">Extra Args</label>
            <input
              id="sf-claude-args"
              className={styles.input}
              value={values.claude_extra_args}
              onChange={(e) => handleChange("claude_extra_args", e.target.value)}
              disabled={isPending}
              placeholder="--dangerously-skip-permissions"
            />
            <div className={styles.help}>
              Passed verbatim after <code>claude</code> at launch. Leave empty for defaults.
            </div>
            {extraArgsValidation.errors.length > 0 && (
              <div className={styles.fieldError} role="alert">
                {extraArgsValidation.errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
            {extraArgsValidation.errors.length === 0 &&
              extraArgsValidation.warnings.length > 0 && (
                <div className={styles.fieldWarning}>
                  {extraArgsValidation.warnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </div>
              )}
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
        {error && <span className={styles.error} role="alert">{error}</span>}
      </div>
    </>
  );
}
