import styles from "./Checkbox.module.css";

type CheckboxState = "open" | "flight" | "done" | "draft";

type Props = {
  state: CheckboxState;
};

export function Checkbox({ state }: Props) {
  // "draft" renders the same as "open" — both are hollow squares.
  const visualState = state === "draft" ? "open" : state;
  const className = `${styles.box} ${styles[visualState] ?? ""}`;

  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 20 20">
        <rect className={styles.rect} x="2" y="2" width="16" height="16" rx="2" />
        {visualState === "flight" && (
          <rect className={styles.fill} x="5" y="5" width="10" height="10" rx="1" />
        )}
        {visualState === "done" && (
          <path className={styles.tick} d="M6 10.5 l2.8 2.8 L14.5 7" />
        )}
      </svg>
    </span>
  );
}
