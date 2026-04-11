import styles from "./LaunchCardPlaceholder.module.css";

export function LaunchCardPlaceholder() {
  return (
    <div className={styles.card}>
      <h4>Ready to launch</h4>
      <p>
        Open a Ghostty session with Claude Code pre-loaded. Creates a worktree
        on a fresh branch.
      </p>
      <div className={styles.actions}>
        <button className={styles.disabled} disabled>
          launch →
        </button>
      </div>
      <div className={styles.hint}>wired up in Phase 5</div>
    </div>
  );
}
