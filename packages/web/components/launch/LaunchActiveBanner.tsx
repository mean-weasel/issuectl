import styles from "./LaunchActiveBanner.module.css";

type Props = {
  branchName: string;
};

export function LaunchActiveBanner({ branchName }: Props) {
  return (
    <div className={styles.banner}>
      <div className={styles.spinner} />
      <div className={styles.text}>
        <div className={styles.title}>Claude Code session active</div>
        <div className={styles.sub}>
          Opened in Ghostty &middot; branch: {branchName}
        </div>
      </div>
    </div>
  );
}
