import styles from "./page.module.css";

export default function Loading() {
  return (
    <main className={styles.shell}>
      <p className={styles.empty}>Loading repo settings...</p>
    </main>
  );
}
