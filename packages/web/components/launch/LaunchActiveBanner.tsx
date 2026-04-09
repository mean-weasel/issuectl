import { EndSessionButton } from "./EndSessionButton";
import styles from "./LaunchActiveBanner.module.css";

type Props = {
  deploymentId: number;
  branchName: string;
  endedAt: string | null;
  owner: string;
  repo: string;
  issueNumber: number;
};

export function LaunchActiveBanner({ deploymentId, branchName, endedAt, owner, repo, issueNumber }: Props) {
  if (endedAt) {
    return (
      <div className={styles.bannerEnded}>
        <div className={styles.checkmark}>{"\u2713"}</div>
        <div className={styles.text}>
          <div className={styles.titleEnded}>Session ended</div>
          <div className={styles.sub}>
            branch: {branchName}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.banner}>
      <div className={styles.spinner} />
      <div className={styles.text}>
        <div className={styles.title}>Claude Code session active</div>
        <div className={styles.sub}>
          branch: {branchName}
        </div>
      </div>
      <EndSessionButton
        deploymentId={deploymentId}
        owner={owner}
        repo={repo}
        issueNumber={issueNumber}
      />
    </div>
  );
}
