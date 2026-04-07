import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import styles from "./Button.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "launch";
  children: ReactNode;
};

export function Button({
  variant = "secondary",
  children,
  className,
  ...rest
}: Props) {
  const cls = cn(styles[variant], className);
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
