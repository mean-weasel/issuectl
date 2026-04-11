import type { ReactNode } from "react";
import styles from "./DetailMeta.module.css";

type Props = {
  children: ReactNode;
};

export function DetailMeta({ children }: Props) {
  return <div className={styles.meta}>{children}</div>;
}

type StateChipProps = {
  state: "open" | "closed" | "merged";
};

export function StateChip({ state }: StateChipProps) {
  return <span className={`${styles.state} ${styles[state]}`}>{state}</span>;
}

export function MetaSeparator() {
  return <span className={styles.sep}>·</span>;
}

export function MetaNum({ children }: { children: ReactNode }) {
  return <span className={styles.num}>{children}</span>;
}
