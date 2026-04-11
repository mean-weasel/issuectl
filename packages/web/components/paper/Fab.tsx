import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Fab.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  "aria-label": string; // required for a11y
};

export function Fab({ children = "+", className, ...rest }: Props) {
  const classes = [styles.fab, className ?? ""].filter(Boolean).join(" ");
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
