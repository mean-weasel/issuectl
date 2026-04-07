import styles from "./AuthStatus.module.css";

type Props = {
  username: string | null;
};

export function AuthStatus({ username }: Props) {
  if (!username) {
    return (
      <div className={styles.card}>
        <span className={styles.dotError} />
        <span className={styles.text}>
          Not authenticated — run <code className={styles.code}>gh auth login</code>
        </span>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <span className={styles.dotOk} />
      <span className={styles.text}>
        Authenticated as <strong className={styles.username}>{username}</strong> via{" "}
        <code className={styles.code}>gh auth</code>
      </span>
    </div>
  );
}
