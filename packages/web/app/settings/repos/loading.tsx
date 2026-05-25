import styles from "./page.module.css";

export default function Loading() {
  return (
    <main className={styles.shell}>
      <section className={styles.summary}>
        <div>
          <h1>Tracked repositories</h1>
          <p className={styles.muted}>Loading repo settings...</p>
        </div>
      </section>
    </main>
  );
}
