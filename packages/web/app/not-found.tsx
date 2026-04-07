import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.icon}>?</div>
        <h1 className={styles.title}>Page not found</h1>
        <p className={styles.message}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link href="/" className={styles.link}>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
