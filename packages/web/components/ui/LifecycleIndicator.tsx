import type { GitHubLabel } from "@issuectl/core";
import styles from "./LifecycleIndicator.module.css";

type LifecycleState = "idle" | "deployed" | "pr" | "done";

function getLifecycleState(labels: GitHubLabel[]): {
  state: LifecycleState;
  text: string;
} {
  const names = new Set(labels.map((l) => l.name));

  if (names.has("issuectl:done")) {
    return { state: "done", text: "Done" };
  }
  if (names.has("issuectl:pr-open")) {
    return { state: "pr", text: "PR open" };
  }
  if (names.has("issuectl:deployed")) {
    return { state: "deployed", text: "Deployed" };
  }
  return { state: "idle", text: "New" };
}

type Props = {
  labels: GitHubLabel[];
};

export function LifecycleIndicator({ labels }: Props) {
  const { state, text } = getLifecycleState(labels);

  return (
    <div className={styles.wrapper}>
      <span className={`${styles.dot} ${styles[state]}`} />
      <span className={styles.text}>{text}</span>
    </div>
  );
}
