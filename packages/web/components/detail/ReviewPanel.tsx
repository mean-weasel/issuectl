"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { GitHubPullReview } from "@issuectl/core";
import { submitReviewAction } from "@/lib/actions/pulls";
import { timeAgo } from "@/lib/format";
import styles from "./ReviewPanel.module.css";

type Props = {
  owner: string;
  repoName: string;
  pullNumber: number;
  reviews: GitHubPullReview[];
  isOpen: boolean;
};

function initials(login: string | undefined): string {
  if (!login) return "??";
  return login.slice(0, 2).toLowerCase();
}

function badgeLabel(state: GitHubPullReview["state"]): string {
  switch (state) {
    case "approved":
      return "approved";
    case "changes_requested":
      return "changes requested";
    case "commented":
      return "commented";
    case "dismissed":
      return "dismissed";
    case "pending":
      return "pending";
  }
}

function badgeClass(state: GitHubPullReview["state"]): string {
  switch (state) {
    case "approved":
      return styles.badgeApproved;
    case "changes_requested":
      return styles.badgeChangesRequested;
    case "commented":
      return styles.badgeCommented;
    case "dismissed":
      return styles.badgeDismissed;
    case "pending":
      return styles.badgeCommented;
  }
}

export function ReviewPanel({
  owner,
  repoName,
  pullNumber,
  reviews,
  isOpen,
}: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (
    event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  ) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitReviewAction(
        owner,
        repoName,
        pullNumber,
        event,
        body.trim() || undefined,
      );
      if (result.success) {
        setBody("");
        router.refresh();
      } else {
        setError(result.error ?? "Failed to submit review");
      }
    } catch (err) {
      console.error("[issuectl] Submit review failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.panel}>
      {reviews.length === 0 && !isOpen && (
        <div className={styles.empty}>
          <em>no reviews</em>
        </div>
      )}

      {reviews.map((review) => (
        <div key={review.id} className={styles.review}>
          <div className={styles.reviewHead}>
            <div className={styles.avi}>
              {review.user?.avatarUrl ? (
                <Image
                  src={review.user.avatarUrl}
                  alt=""
                  width={24}
                  height={24}
                  data-avatar="true"
                />
              ) : (
                initials(review.user?.login)
              )}
            </div>
            <span className={styles.who}>
              {review.user?.login ?? "unknown"}
            </span>
            <span className={`${styles.badge} ${badgeClass(review.state)}`}>
              {badgeLabel(review.state)}
            </span>
            {review.submittedAt && (
              <span className={styles.time}>
                {timeAgo(review.submittedAt)}
              </span>
            )}
          </div>
          {review.body && (
            <div className={styles.reviewBody}>{review.body}</div>
          )}
        </div>
      ))}

      {isOpen && (
        <div className={styles.form}>
          <textarea
            className={styles.textarea}
            placeholder="Leave a review..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={submitting}
            rows={3}
            maxLength={65536}
          />
          <div className={styles.formActions}>
            <button
              type="button"
              className={`${styles.submitBtn} ${styles.approveBtn}`}
              onClick={() => handleSubmit("APPROVE")}
              disabled={submitting}
            >
              {submitting ? "submitting..." : "approve"}
            </button>
            <button
              type="button"
              className={`${styles.submitBtn} ${styles.changesBtn}`}
              onClick={() => handleSubmit("REQUEST_CHANGES")}
              disabled={submitting || !body.trim()}
            >
              request changes
            </button>
            <button
              type="button"
              className={styles.submitBtn}
              onClick={() => handleSubmit("COMMENT")}
              disabled={submitting || !body.trim()}
            >
              comment
            </button>
          </div>
          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
