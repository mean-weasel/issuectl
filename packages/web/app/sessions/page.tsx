import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { SessionsReviewList } from "@/components/sessions/SessionsReviewList";
import { getSessionsOverviewData, normalizeSessionsFilters } from "@/lib/sessions-data";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sessions - issuectl" };

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = normalizeSessionsFilters(await searchParams);
  const data = await getSessionsOverviewData(filters);

  return (
    <>
      <PageHeader
        title="Sessions"
        breadcrumb={<Link href="/">dashboard</Link>}
        actions={<Link className={styles.headerLink} href="/workbench">Workbench</Link>}
      />
      <main className={styles.shell}>
        <section className={styles.intro}>
          <div>
            <h1>Sessions and reviews</h1>
            <p>Scan active terminals, recently ended agent sessions, and PR review runs across tracked repositories.</p>
          </div>
          <Link className={styles.secondaryLink} href="/settings/repos">Repo settings</Link>
        </section>
        <SessionsReviewList data={data} />
      </main>
    </>
  );
}
