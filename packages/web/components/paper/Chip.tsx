import type { ReactNode } from "react";
import styles from "./Chip.module.css";

type ChipTint = "brick" | "butter" | "accent";

// Discriminated union: when variant is "tinted", tint is required;
// for "default"/"dashed", tint must not be provided. This prevents
// the silent-invisible case where <Chip variant="tinted"> renders
// with no background color.
type Props = { children: ReactNode } & (
  | { variant?: "default" | "dashed"; tint?: never }
  | { variant: "tinted"; tint: ChipTint }
);

export function Chip(props: Props) {
  if (props.variant === "tinted") {
    return (
      <span
        className={`${styles.chip} ${styles.tinted} ${styles[props.tint]}`}
      >
        {props.children}
      </span>
    );
  }

  const variant = props.variant ?? "default";
  return (
    <span className={`${styles.chip} ${styles[variant]}`}>
      {props.children}
    </span>
  );
}
