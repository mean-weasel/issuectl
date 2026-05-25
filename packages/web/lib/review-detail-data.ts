import {
  dbExists,
  getDb,
  getDeploymentById,
  getPrReviewById,
  getRepoById,
  listPrReviewsForPull,
  queryDiagnosticEvents,
  type Deployment,
  type DiagnosticEvent,
  type PrReview,
  type Repo,
} from "@issuectl/core";

export type ReviewBanner = {
  tone: "bad" | "warn" | "info";
  title: string;
  body: string;
};

export type ReviewLineageItem = PrReview & {
  active: boolean;
  result: Record<string, unknown>;
  label: string;
};

export type ReviewDetailData = {
  initialized: boolean;
  review: PrReview;
  repo: Repo;
  deployment: Deployment | null;
  lineage: ReviewLineageItem[];
  diagnostics: DiagnosticEvent[];
  result: Record<string, unknown>;
  deploymentResult: Record<string, unknown>;
  metadata: {
    currentReviewPreamble: string | null;
    triggerEvent: DiagnosticEvent | null;
  };
  banners: ReviewBanner[];
  actions: {
    canRetry: boolean;
    canFullRerun: boolean;
    disabledReason: string | null;
  };
  links: {
    githubPr: string;
    githubReview: string | null;
    githubReviewFiles: string;
    workbench: string;
    repoSettings: string;
    sessions: string;
    webhookLogs: string;
    diagnosticsCli: string;
  };
};

export type ReviewActionRequest = {
  review: PrReview;
  repo: Repo;
  mode: "retry" | "full";
  now: number;
};

export function getReviewDetailData(reviewId: number): ReviewDetailData | null {
  if (!dbExists()) return null;
  const db = getDb();
  const review = getPrReviewById(db, reviewId);
  if (!review) return null;
  const repo = getRepoById(db, review.repoId);
  if (!repo) return null;
  const deployment = review.deploymentId ? getDeploymentById(db, review.deploymentId) ?? null : null;
  const lineage = listPrReviewsForPull(db, review.repoId, review.prNumber, 24);
  const diagnostics = queryDiagnosticEvents(db, {
    target: { owner: repo.owner, repo: repo.name, targetType: "pr", targetNumber: review.prNumber },
    limit: 12,
  });
  return buildReviewDetailData({ review, repo, deployment, lineage, diagnostics });
}

export function buildReviewDetailData(input: {
  review: PrReview;
  repo: Repo;
  deployment?: Deployment | null;
  lineage?: PrReview[];
  diagnostics?: DiagnosticEvent[];
}): ReviewDetailData {
  const result = parseJsonObject(input.review.resultJson);
  const deploymentResult = parseJsonObject(input.deployment?.completionResultJson ?? null);
  const lineage = (input.lineage ?? [input.review]).map((item) => ({
    ...item,
    active: item.id === input.review.id,
    result: parseJsonObject(item.resultJson),
    label: lineageLabel(item),
  }));
  const activeReview = lineage.find((item) => ACTIVE_REVIEW_STATUSES.has(item.status));
  const triggerEvent = triggerDiagnostic(input.diagnostics ?? []);
  return {
    initialized: true,
    review: input.review,
    repo: input.repo,
    deployment: input.deployment ?? null,
    lineage,
    diagnostics: input.diagnostics ?? [],
    result,
    deploymentResult,
    metadata: {
      currentReviewPreamble: input.repo.reviewPreamble,
      triggerEvent,
    },
    banners: deriveBanners(input.review, result, deploymentResult),
    actions: {
      canRetry: !activeReview,
      canFullRerun: !activeReview,
      disabledReason: activeReview ? `Run #${activeReview.id} is still ${labelize(activeReview.status)}.` : null,
    },
    links: reviewLinks(input.repo, input.review, result, deploymentResult),
  };
}

export function buildReviewActionRequest(input: ReviewActionRequest): {
  intent: {
    repoId: number;
    targetType: "pr";
    targetNumber: number;
    signalAt: number;
    scheduledAt: number;
    desiredHeadSha: string;
    requestedAgent: "claude" | "codex";
    reviewMode: "auto" | "full";
  };
  diagnosticEvent: "pr_review.retry" | "pr_review.manual_rerun";
  diagnosticMessage: string;
} {
  const full = input.mode === "full";
  return {
    intent: {
      repoId: input.repo.id,
      targetType: "pr",
      targetNumber: input.review.prNumber,
      signalAt: input.now,
      scheduledAt: input.now,
      desiredHeadSha: input.review.reviewedToSha,
      requestedAgent: input.repo.reviewAgent,
      reviewMode: full ? "full" : "auto",
    },
    diagnosticEvent: full ? "pr_review.manual_rerun" : "pr_review.retry",
    diagnosticMessage: full ? "Manual full PR review rerun requested." : "PR review retry requested.",
  };
}

function deriveBanners(
  review: PrReview,
  result: Record<string, unknown>,
  deploymentResult: Record<string, unknown>,
): ReviewBanner[] {
  const banners: ReviewBanner[] = [];
  const reason = stringValue(result.reason) ?? stringValue(result.error) ?? stringValue(deploymentResult.reason);
  if (review.status === "failed" || typeof result.error === "string") {
    banners.push({
      tone: "bad",
      title: "Review failed",
      body: reason ?? "The review worker recorded a failed terminal state.",
    });
  }
  if (review.status === "superseded" || reason === "force_push") {
    banners.push({
      tone: "warn",
      title: "Reviewed range superseded",
      body: "A later force push or review run replaced this reviewed range.",
    });
  }
  if (typeof result.desiredHeadSha === "string" || result.followUpGeneration === 1) {
    banners.push({
      tone: "info",
      title: "Follow-up requested",
      body: "A newer PR head was coalesced while this review was active.",
    });
  }
  return banners;
}

function reviewLinks(
  repo: Repo,
  review: PrReview,
  result: Record<string, unknown>,
  deploymentResult: Record<string, unknown>,
): ReviewDetailData["links"] {
  const fullName = `${repo.owner}/${repo.name}`;
  return {
    githubPr: `https://github.com/${fullName}/pull/${review.prNumber}`,
    githubReview: reviewUrl(result) ?? reviewUrl(deploymentResult),
    githubReviewFiles: `https://github.com/${fullName}/pull/${review.prNumber}/files`,
    workbench: `/workbench?repo=${encodeURIComponent(fullName)}`,
    repoSettings: `/repos/${repo.owner}/${repo.name}/settings`,
    sessions: `/sessions?tab=reviews&repo=${encodeURIComponent(fullName)}&q=${encodeURIComponent(`PR #${review.prNumber}`)}`,
    webhookLogs: `/logs/webhooks?q=${encodeURIComponent(`${fullName}#${review.prNumber}`)}`,
    diagnosticsCli: `pnpm --dir packages/cli exec issuectl diag show --pr ${fullName}#${review.prNumber}`,
  };
}

function triggerDiagnostic(events: DiagnosticEvent[]): DiagnosticEvent | null {
  return events.find((event) =>
    event.event === "webhook.pr_launched" ||
    event.event === "webhook.launched" ||
    event.event === "pr_review.retry" ||
    event.event === "pr_review.manual_rerun"
  ) ?? events[0] ?? null;
}

function reviewUrl(value: Record<string, unknown>): string | null {
  return stringValue(value.githubReviewUrl)
    ?? stringValue(value.reviewUrl)
    ?? stringValue(value.reviewHtmlUrl)
    ?? stringValue(value.postedReviewUrl)
    ?? null;
}

function lineageLabel(review: PrReview): string {
  if (review.reviewedFromSha) return `${shortSha(review.reviewedFromSha)}..${shortSha(review.reviewedToSha)}`;
  return `full ${shortSha(review.reviewedToSha)}`;
}

function shortSha(value: string): string {
  return value.slice(0, 7);
}

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function labelize(value: string): string {
  return value.replaceAll("_", " ");
}

const ACTIVE_REVIEW_STATUSES = new Set(["reserved", "launching", "in_progress"]);
