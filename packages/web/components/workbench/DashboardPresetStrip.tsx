import {
  DASHBOARD_PRESETS,
  type DashboardPresetId,
} from "./dashboard-presets";
import styles from "./WorkbenchShell.module.css";

type Props = {
  activePresetId: DashboardPresetId | null;
  ariaLabel: string;
  defaultPresetId?: DashboardPresetId | null;
  onApply: (id: DashboardPresetId) => void;
  onSetDefault?: (id: DashboardPresetId) => void;
};

export function DashboardPresetStrip({
  activePresetId,
  ariaLabel,
  defaultPresetId,
  onApply,
  onSetDefault,
}: Props) {
  const defaultPreset = DASHBOARD_PRESETS.find((preset) => preset.id === defaultPresetId);

  return (
    <div className={styles.dashboardPresetStrip} role="group" aria-label={ariaLabel}>
      <span className={styles.dashboardPresetLabel}>Triage presets</span>
      {DASHBOARD_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className={activePresetId === preset.id ? styles.primaryButton : styles.secondaryButton}
          aria-pressed={activePresetId === preset.id}
          title={preset.description}
          onClick={() => onApply(preset.id)}
        >
          {preset.label}
        </button>
      ))}
      {activePresetId && onSetDefault && (
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => onSetDefault(activePresetId)}
        >
          Set default
        </button>
      )}
      {defaultPreset && (
        <span className={styles.dashboardPresetDefault}>Default: {defaultPreset.label}</span>
      )}
    </div>
  );
}
