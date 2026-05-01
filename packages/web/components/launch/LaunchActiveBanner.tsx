import { EndSessionButton } from "./EndSessionButton";
import { OpenTerminalButton } from "@/components/terminal/OpenTerminalButton";
import { launchAgentLabel, type LaunchAgent } from "./agent";
import styles from "./LaunchActiveBanner.module.css";

type Props = {
  deploymentId: number;
  branchName: string;
  endedAt: string | null;
  owner: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
  ttydPort: number | null;
  agent: LaunchAgent;
};

export function LaunchActiveBanner({ deploymentId, branchName, endedAt, owner, repo, issueNumber, issueTitle, ttydPort, agent }: Props) {
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
        <div className={styles.title}>{launchAgentLabel(agent)} session active</div>
        <div className={styles.sub}>
          branch: {branchName}
        </div>
      </div>
      {ttydPort !== null && (
        <OpenTerminalButton
          ttydPort={ttydPort}
          deploymentId={deploymentId}
          owner={owner}
          repo={repo}
          issueNumber={issueNumber}
          issueTitle={issueTitle}
        />
      )}
      <EndSessionButton
        deploymentId={deploymentId}
        owner={owner}
        repo={repo}
        issueNumber={issueNumber}
      />
    </div>
  );
}
