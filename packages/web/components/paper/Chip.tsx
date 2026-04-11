import type { ReactNode } from "react";
import styles from "./Chip.module.css";

type ChipVariant = "default" | "dashed" | "tinted";
type ChipTint = "brick" | "butter" | "accent";

type Props = {
  children: ReactNode;
  variant?: ChipVariant;
  tint?: ChipTint; // only meaningful when variant === "tinted"
};

export function Chip({ children, variant = "default", tint }: Props) {
  const className =
    variant === "tinted" && tint
      ? `${styles.chip} ${styles.tinted} ${styles[tint]}`
      : `${styles.chip} ${styles[variant]}`;

  return <span className={className}>{children}</span>;
}
