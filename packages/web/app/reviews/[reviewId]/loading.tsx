import { PageHeader } from "@/components/ui/PageHeader";
import styles from "./page.module.css";

export default function ReviewDetailLoading() {
  return (
    <>
      <PageHeader title="PR review" />
      <main className={styles.shell}>
        <div className={styles.loadingLayout}>
          <div />
          <div />
        </div>
      </main>
    </>
  );
}
