import {
  DASHBOARD_PRESETS,
  type DashboardPresetId,
} from "./dashboard-presets";
import styles from "./WorkbenchShell.module.css";

type Props = {
  activePresetId: DashboardPresetId | null;
  ariaLabel: string;
  onApply: (id: DashboardPresetId) => void;
};

export function DashboardPresetStrip({ activePresetId, ariaLabel, onApply }: Props) {
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
    </div>
  );
}
