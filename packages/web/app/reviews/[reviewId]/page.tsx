import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ReviewDetailPanel } from "@/components/reviews/ReviewDetailPanel";
import { getReviewDetailData } from "@/lib/review-detail-data";
import { manualFullRerunPrReviewAction, retryPrReviewAction } from "./actions";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "PR review - issuectl" };

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const id = Number(reviewId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const data = getReviewDetailData(id);
  if (!data) notFound();

  return (
    <>
      <PageHeader
        title="PR review"
        breadcrumb={<Link href="/sessions?tab=reviews">reviews</Link>}
        actions={<Link className={styles.headerLink} href={data.links.githubPr}>GitHub PR</Link>}
      />
      <main className={styles.shell}>
        <ReviewDetailPanel
          data={data}
          retryAction={retryPrReviewAction}
          fullRerunAction={manualFullRerunPrReviewAction}
        />
      </main>
    </>
  );
}
