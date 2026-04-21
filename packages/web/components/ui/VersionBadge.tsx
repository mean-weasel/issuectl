import styles from "./VersionBadge.module.css";

type Props = {
  className?: string;
};

export function VersionBadge({ className }: Props) {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

  return (
    <span className={`${styles.badge} ${className ?? ""}`}>
      v{version}
    </span>
  );
}
