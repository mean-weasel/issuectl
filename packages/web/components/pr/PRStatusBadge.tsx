import type { GitHubPull } from "@issuectl/core";
import styles from "./PRStatusBadge.module.css";

type Props = {
  pull: GitHubPull;
};

function getStatus(pull: GitHubPull): { label: string; className: string } {
  if (pull.merged) return { label: "Merged", className: styles.merged };
  if (pull.state === "closed") return { label: "Closed", className: styles.closed };
  return { label: "Open", className: styles.open };
}

export function PRStatusBadge({ pull }: Props) {
  const { label, className } = getStatus(pull);
  return <span className={`${styles.badge} ${className}`}>{label}</span>;
}
