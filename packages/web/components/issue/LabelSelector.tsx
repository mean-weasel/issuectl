"use client";

import type { GitHubLabel } from "@issuectl/core";
import { isLifecycleLabel } from "@/lib/labels";
import styles from "./LabelSelector.module.css";

type Props = {
  available: GitHubLabel[];
  selected: string[];
  onToggle: (label: string) => void;
  disabled?: boolean;
};

function selectedStyle(label: GitHubLabel): React.CSSProperties {
  if (label.color) {
    return {
      background: `#${label.color}18`,
      color: `#${label.color}`,
      borderColor: `#${label.color}50`,
    };
  }
  return {
    background: "var(--accent-surface)",
    color: "var(--accent)",
    borderColor: "var(--accent-border)",
  };
}

export function LabelSelector({
  available,
  selected,
  onToggle,
  disabled,
}: Props) {
  const toggleable = available.filter((l) => !isLifecycleLabel(l.name));

  if (toggleable.length === 0) return null;

  return (
    <div className={styles.chips}>
      {toggleable.map((label) => {
        const isSelected = selected.includes(label.name);
        return (
          <button
            key={label.name}
            type="button"
            className={isSelected ? styles.chipSelected : styles.chip}
            style={isSelected ? selectedStyle(label) : undefined}
            onClick={() => onToggle(label.name)}
            aria-pressed={isSelected}
            disabled={disabled}
          >
            {label.name}
          </button>
        );
      })}
    </div>
  );
}
