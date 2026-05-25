import { PageHeader } from "@/components/ui/PageHeader";
import styles from "./page.module.css";

export default function SessionsLoading() {
  return (
    <>
      <PageHeader title="Sessions" />
      <main className={styles.shell}>
        <section className={styles.intro}>
          <div>
            <h1>Sessions and reviews</h1>
            <p>Loading session and review activity.</p>
          </div>
        </section>
        <div className={styles.loadingGrid}>
          <div />
          <div />
          <div />
          <div />
        </div>
      </main>
    </>
  );
}
