"use client";

import { useState, useTransition } from "react";
import { updateSetting } from "@/lib/actions/settings";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/ui/Button";
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

  const extraArgsValidation = validateClaudeArgs(values.claude_extra_args);
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
      for (const key of changed) {
        const result = await updateSetting(key as SettingKey, values[key]);
        if (!result.success) {
          setError(result.error ?? `Failed to save ${key}`);
          return;
        }
      }
      showToast("Settings saved", "success");
    });
  }

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionTitle}>Defaults</div>
        <div className={styles.row}>
          <div className={styles.field}>
            <div className={styles.label}>Branch Pattern</div>
            <input
              className={styles.input}
              value={values.branch_pattern}
              onChange={(e) => handleChange("branch_pattern", e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>Cache TTL (seconds)</div>
            <input
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
            <div className={styles.label}>Application</div>
            <input
              className={styles.inputReadonly}
              value={terminalApp}
              readOnly
            />
          </div>
          <div className={styles.field}>
            <div className={styles.label}>Window Title</div>
            <input
              className={styles.input}
              value={values.terminal_window_title}
              onChange={(e) => handleChange("terminal_window_title", e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <div className={styles.label}>Tab Title Pattern</div>
            <input
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
            <div className={styles.label}>Extra Args</div>
            <input
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
