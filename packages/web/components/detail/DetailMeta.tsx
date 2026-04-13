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

// Per-state icon glyph. Color alone is not enough to convey the
// distinction between open / closed / merged for users with the kinds
// of color blindness that confuse green and purple — the chip needs a
// non-color signal too.
const STATE_GLYPH = {
  open: "○", // hollow circle — issue/PR is still active
  closed: "✕", // x — closed without merging
  merged: "⤥", // arrow into a target — merged into the base branch
} as const;

export function StateChip({ state }: StateChipProps) {
  return (
    <span className={`${styles.state} ${styles[state]}`}>
      <span aria-hidden="true" className={styles.stateGlyph}>
        {STATE_GLYPH[state]}
      </span>
      {state}
    </span>
  );
}

export function MetaSeparator() {
  return <span className={styles.sep}>·</span>;
}

export function MetaNum({ children }: { children: ReactNode }) {
  return <span className={styles.num}>{children}</span>;
}
