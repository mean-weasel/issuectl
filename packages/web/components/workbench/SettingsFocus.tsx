"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { WorkbenchSectionCollapseState, WorkbenchSectionId } from "./workbench-state";
import type { WorkbenchHealth, WorkbenchPayload, WorkbenchSettings, WorkbenchUser } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type Props = {
  payload: WorkbenchPayload;
  collapsedSections: WorkbenchSectionCollapseState;
  onToggleSection: (section: WorkbenchSectionId) => void;
  onSettingsUpdated: (settings: WorkbenchSettings) => void;
};

type SettingsResponse = { settings: WorkbenchSettings };

export function SettingsFocus({ payload, collapsedSections, onToggleSection, onSettingsUpdated }: Props) {
  const [settings, setSettings] = useState<WorkbenchSettings>(payload.settings);
  const [health, setHealth] = useState<WorkbenchHealth>(payload.health);
  const [user, setUser] = useState<WorkbenchUser>(payload.user);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void loadSettingsSurface(controller.signal);
    return () => controller.abort();
  }, []);

  async function loadSettingsSurface(signal?: AbortSignal) {
    setError(null);
    try {
      const [settingsBody, healthBody, userBody] = await Promise.all([
        requestJson<SettingsResponse>("/api/v1/settings", { method: "GET", signal }),
        requestJson<WorkbenchHealth>("/api/v1/health", { method: "GET", signal }),
        requestJson<WorkbenchUser>("/api/v1/user", { method: "GET", signal }),
      ]);
      setSettings(settingsBody.settings);
      setHealth({ ...healthBody, error: "error" in healthBody ? healthBody.error : null });
      setUser({ login: userBody.login ?? null, error: userBody.error ?? null });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unable to load settings");
    }
  }

  function updateSetting(key: keyof WorkbenchSettings, value: string) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings() {
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const patch = {
        branch_pattern: settings.branch_pattern ?? "",
        cache_ttl: settings.cache_ttl ?? "",
        worktree_dir: settings.worktree_dir ?? "",
        launch_agent: settings.launch_agent ?? "codex",
        claude_extra_args: settings.claude_extra_args ?? "",
        codex_extra_args: settings.codex_extra_args ?? "",
        idle_grace_period: settings.idle_grace_period ?? "",
        idle_threshold: settings.idle_threshold ?? "",
      };
      await requestJson<{ success: true }>("/api/v1/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      onSettingsUpdated(patch);
      setStatus("Settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save settings");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.focusInner}>
      <p className={styles.kicker}>Settings</p>
      <h1>Workbench settings</h1>
      <p className={styles.muted}>
        Launch defaults, cache behavior, local worktree paths, and service state for this browser session.
      </p>

      <SettingsSection
        id="workbench-settings-health"
        title="Health"
        controlLabel="Toggle settings health"
        bodyLabel="Health summary"
        collapsed={collapsedSections.settingsHealth}
        section="settingsHealth"
        onToggle={onToggleSection}
      >
        <dl style={summaryGridStyle}>
          <div>
            <dt style={labelStyle}>Server</dt>
            <dd>{health.ok ? "ok" : "unavailable"}</dd>
          </div>
          <div>
            <dt style={labelStyle}>User</dt>
            <dd>{user.login ?? user.error ?? "unknown"}</dd>
          </div>
          <div>
            <dt style={labelStyle}>Tracked repos</dt>
            <dd>{payload.repos.length}</dd>
          </div>
          <div>
            <dt style={labelStyle}>Version</dt>
            <dd>{health.version ?? "unknown"}</dd>
          </div>
        </dl>
        {health.error && <p role="alert" style={errorStyle}>{health.error}</p>}
      </SettingsSection>

      <SettingsSection
        id="workbench-settings-launch-defaults"
        title="Launch defaults"
        controlLabel="Toggle settings launch defaults"
        bodyLabel="Settings form"
        collapsed={collapsedSections.settingsLaunchDefaults}
        section="settingsLaunchDefaults"
        onToggle={onToggleSection}
      >
        <div style={formGridStyle}>
          <SettingInput label="Branch pattern" value={settings.branch_pattern} onChange={(value) => updateSetting("branch_pattern", value)} />
          <SettingInput label="Cache TTL" value={settings.cache_ttl} onChange={(value) => updateSetting("cache_ttl", value)} />
          <SettingInput label="Worktree directory" value={settings.worktree_dir} onChange={(value) => updateSetting("worktree_dir", value)} />
          <label style={fieldStyle}>
            <span>Launch agent</span>
            <select
              aria-label="Launch agent"
              value={settings.launch_agent ?? "codex"}
              onChange={(event) => updateSetting("launch_agent", event.target.value)}
              style={inputStyle}
            >
              <option value="codex">Codex</option>
              <option value="claude">Claude Code</option>
            </select>
          </label>
          <SettingInput label="Claude extra args" value={settings.claude_extra_args} onChange={(value) => updateSetting("claude_extra_args", value)} />
          <SettingInput label="Codex extra args" value={settings.codex_extra_args} onChange={(value) => updateSetting("codex_extra_args", value)} />
          <SettingInput label="Idle grace period" value={settings.idle_grace_period} onChange={(value) => updateSetting("idle_grace_period", value)} />
          <SettingInput label="Idle threshold" value={settings.idle_threshold} onChange={(value) => updateSetting("idle_threshold", value)} />
        </div>
        <button type="button" className={styles.primaryButton} onClick={saveSettings} disabled={busy}>
          Save settings
        </button>
      </SettingsSection>

      {status && <p role="status" style={statusStyle}>{status}</p>}
      {error && <p role="alert" style={errorStyle}>{error}</p>}
    </div>
  );
}

function SettingsSection({
  id,
  title,
  controlLabel,
  bodyLabel,
  collapsed,
  section,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  controlLabel: string;
  bodyLabel: string;
  collapsed: boolean;
  section: WorkbenchSectionId;
  onToggle: (section: WorkbenchSectionId) => void;
  children: ReactNode;
}) {
  return (
    <section className={styles.collapsibleSection} style={sectionStyle}>
      <button
        type="button"
        className={styles.collapsibleHeader}
        aria-expanded={!collapsed}
        aria-controls={id}
        aria-label={controlLabel}
        onClick={() => onToggle(section)}
      >
        <span>{title}</span>
        <span aria-hidden="true">v</span>
      </button>
      <div id={id} className={styles.collapsibleBody} aria-label={bodyLabel} hidden={collapsed}>
        <h2 style={headingStyle}>{title}</h2>
        {children}
      </div>
    </section>
  );
}

function SettingInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input
        aria-label={label}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
        autoComplete="off"
      />
    </label>
  );
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

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const fieldStyle = {
  display: "grid",
  gap: 6,
  color: "var(--paper-ink-muted)",
  font: "700 10px var(--paper-mono)",
  textTransform: "uppercase",
} satisfies CSSProperties;

const labelStyle = {
  color: "var(--paper-ink-muted)",
  font: "700 10px var(--paper-mono)",
  textTransform: "uppercase",
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
