import styles from "./SyncDot.module.css";

type SyncStatus = "local" | "syncing";

// Compile-time guarantee that every SyncStatus has a matching CSS class.
const statusClass: Record<SyncStatus, string> = {
  local: styles.local,
  syncing: styles.syncing,
};

type Props = {
  status: SyncStatus;
  label?: string;
};

/**
 * Tiny colored dot indicating sync state:
 * - "local"   → solid amber dot (--paper-butter, local-only, not yet on GitHub)
 * - "syncing" → pulsing accent dot (--paper-accent, in-flight to GitHub)
 *
 * Consumers should not render this component when data is synced —
 * absence of the dot implies synced state.
 */
export function SyncDot({ status, label }: Props) {
  return (
    <span className={styles.wrapper} aria-label={label ?? status}>
      <span className={`${styles.dot} ${statusClass[status]}`} />
      {label && <span className={styles.label}>{label}</span>}
    </span>
  );
}
