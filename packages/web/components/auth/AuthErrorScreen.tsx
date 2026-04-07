import { RefreshButton } from "./RefreshButton";
import styles from "./AuthErrorScreen.module.css";

const STEPS = [
  { title: "Install the GitHub CLI", command: "brew install gh" },
  { title: "Authenticate", command: "gh auth login" },
  {
    title: "Restart issuectl",
    detail: "Refresh this page or restart the CLI",
  },
] as const;

export function AuthErrorScreen() {
  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.icon}>!</div>
        <h1 className={styles.title}>GitHub authentication required</h1>
        <p className={styles.description}>
          issuectl uses the GitHub CLI for authentication. It looks like{" "}
          <code className={styles.inlineCode}>gh</code> is not authenticated.
        </p>

        <div className={styles.card}>
          <div className={styles.cardTitle}>To fix this:</div>
          {STEPS.map((step, i) => (
            <div key={i} className={styles.step}>
              <span className={styles.stepNumber}>{i + 1}</span>
              <div>
                <div className={styles.stepTitle}>{step.title}</div>
                {"command" in step ? (
                  <code className={styles.stepCommand}>{step.command}</code>
                ) : (
                  <div className={styles.stepDetail}>{step.detail}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <RefreshButton />
      </div>
    </div>
  );
}
