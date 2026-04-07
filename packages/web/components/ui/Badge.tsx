import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import styles from "./Badge.module.css";

type Props = {
  label: string;
  color?: string;
  className?: string;
};

function labelColor(name: string, hexColor?: string): CSSProperties {
  const lower = name.toLowerCase();
  if (lower === "bug") {
    return { background: "var(--red-surface)", color: "var(--red)" };
  }
  if (lower === "enhancement") {
    return { background: "var(--purple-surface)", color: "var(--purple)" };
  }
  if (lower.startsWith("issuectl:deployed")) {
    return {
      background: "var(--yellow-surface)",
      color: "var(--yellow)",
      border: "1px solid var(--yellow-border)",
    };
  }
  if (lower.startsWith("issuectl:pr-open")) {
    return {
      background: "var(--blue-surface)",
      color: "var(--blue)",
      border: "1px solid var(--blue-border)",
    };
  }
  if (lower.startsWith("issuectl:done")) {
    return {
      background: "var(--green-surface)",
      color: "var(--green)",
      border: "1px solid var(--green-border)",
    };
  }
  if (hexColor) {
    return {
      background: `#${hexColor}18`,
      color: `#${hexColor}`,
    };
  }
  return {
    background: "var(--bg-elevated)",
    color: "var(--text-tertiary)",
    border: "1px solid var(--border)",
  };
}

export function Badge({ label, color, className }: Props) {
  const style = labelColor(label, color);
  return (
    <span className={cn(styles.badge, className)} style={style}>
      {label}
    </span>
  );
}
