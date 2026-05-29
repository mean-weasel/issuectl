import type {
  Deployment,
  DeploymentTargetType,
  DiagnosticEvent,
  PrReview,
  PrReviewStatus,
  Repo,
  WebhookLogEntry,
} from "@issuectl/core";

type RepoSummary = {
  id: number;
  fullName: string;
};

type RepoLookup = Map<number, Repo>;

const ACTIVE_REVIEW_STATUSES = new Set<PrReviewStatus>(["reserved", "launching", "in_progress"]);

export function repoFullName(repo: Repo): string {
  return `${repo.owner}/${repo.name}`;
}

export function repoSummaries(repos: Repo[]): RepoSummary[] {
  return repos.map((repo) => ({ id: repo.id, fullName: repoFullName(repo) }));
}

export function findRepoByFullName(repos: Repo[], fullName: string): Repo | undefined {
  return repos.find((repo) => repoFullName(repo) === fullName);
}

export function repoLookupById(repos: Repo[]): RepoLookup {
  return new Map(repos.map((repo) => [repo.id, repo]));
}

export function buildWebhookEventsPayload(input: {
  entries: WebhookLogEntry[];
  repos: Repo[];
  filters: {
    repo: string | null;
    targetType: DeploymentTargetType | null;
    targetNumber: number | null;
    limit: number;
  };
}): unknown {
  const reposById = repoLookupById(input.repos);
  const events = input.entries.map((entry) => {
    const repo = reposById.get(entry.repoId);
    return {
      id: entry.id,
      deliveryId: entry.deliveryId,
      repoId: entry.repoId,
      repoFullName: repo ? repoFullName(repo) : null,
      owner: repo?.owner ?? null,
      repoName: repo?.name ?? null,
      eventType: entry.eventType,
      action: entry.action,
      senderLogin: entry.senderLogin,
      targetType: entry.targetType,
      targetNumber: entry.targetNumber,
      targetLabel: entry.targetType && entry.targetNumber !== null
        ? targetLabel(entry.targetType, entry.targetNumber)
        : null,
      receivedAt: entry.receivedAt,
      receivedAtIso: toIso(entry.receivedAt),
      intentId: entry.intentId,
      result: entry.result,
      resultDetail: entry.resultDetail,
      actionId: entry.actionId,
      intent: entry.intent
        ? {
            id: entry.intent.id,
            status: entry.intent.status,
            targetType: entry.intent.targetType,
            targetNumber: entry.intent.targetNumber,
            targetLabel: targetLabel(entry.intent.targetType, entry.intent.targetNumber),
            firstSignalAt: entry.intent.firstSignalAt,
            firstSignalAtIso: toIso(entry.intent.firstSignalAt),
            lastSignalAt: entry.intent.lastSignalAt,
            lastSignalAtIso: toIso(entry.intent.lastSignalAt),
            scheduledAt: entry.intent.scheduledAt,
            scheduledAtIso: toIso(entry.intent.scheduledAt),
            processingStartedAt: entry.intent.processingStartedAt,
            processingStartedAtIso: nullableIso(entry.intent.processingStartedAt),
            leaseExpiresAt: entry.intent.leaseExpiresAt,
            leaseExpiresAtIso: nullableIso(entry.intent.leaseExpiresAt),
            resolvedAt: entry.intent.resolvedAt,
            resolvedAtIso: nullableIso(entry.intent.resolvedAt),
            generation: entry.intent.generation,
            requestedAgent: entry.intent.requestedAgent,
            reviewMode: entry.intent.reviewMode,
            signalCount: entry.intent.signalCount,
            deploymentId: entry.intent.deploymentId,
            failureReason: entry.intent.failureReason,
          }
        : null,
    };
  });

  return {
    events,
    repos: repoSummaries(input.repos),
    filters: input.filters,
    summary: {
      count: events.length,
      latestReceivedAt: input.entries[0]?.receivedAt ?? null,
      latestReceivedAtIso: nullableIso(input.entries[0]?.receivedAt ?? null),
      resultCounts: countBy(input.entries, (entry) => entry.result),
    },
  };
}

export function buildPrReviewsPayload(input: {
  reviews: PrReview[];
  repos: Repo[];
  deploymentsById: Map<number, Deployment>;
  filters: {
    repo: string | null;
    pr: number | null;
    status: PrReviewStatus | "all";
    limit: number;
  };
}): unknown {
  const reposById = repoLookupById(input.repos);
  const reviews = input.reviews.map((review) => {
    const repo = reposById.get(review.repoId);
    const result = parseJsonObject(review.resultJson);
    const deployment = review.deploymentId === null ? null : input.deploymentsById.get(review.deploymentId) ?? null;
    return {
      id: review.id,
      repoId: review.repoId,
      repoFullName: repo ? repoFullName(repo) : null,
      owner: repo?.owner ?? null,
      repoName: repo?.name ?? null,
      prNumber: review.prNumber,
      deploymentId: review.deploymentId,
      startedHeadSha: review.startedHeadSha,
      completedHeadSha: review.completedHeadSha,
      reviewBaseSha: review.reviewBaseSha,
      reviewedFromSha: review.reviewedFromSha,
      reviewedToSha: review.reviewedToSha,
      headRepoFullName: review.headRepoFullName,
      headRef: review.headRef,
      status: review.status,
      triggeredBy: review.triggeredBy,
      result,
      summary: stringValue(result.summary) ?? stringValue(result.reason) ?? stringValue(result.error) ?? null,
      findingCount: numberValue(result.findingCount)
        ?? numberValue(result.fixedFindingCount)
        ?? arrayLength(result.findings)
        ?? arrayLength(result.comments),
      rangeLabel: reviewRangeLabel(review),
      detailHref: `/reviews/${review.id}`,
      startedAt: review.startedAt,
      startedAtIso: toIso(review.startedAt),
      completedAt: review.completedAt,
      completedAtIso: nullableIso(review.completedAt),
      deployment: deployment ? mobileDeployment(deployment) : null,
    };
  });

  return {
    reviews,
    repos: repoSummaries(input.repos),
    filters: input.filters,
    summary: {
      count: reviews.length,
      activeCount: input.reviews.filter((review) => ACTIVE_REVIEW_STATUSES.has(review.status)).length,
      completedCount: input.reviews.filter((review) => review.status === "completed").length,
      failedCount: input.reviews.filter((review) => review.status === "failed").length,
      latestStartedAt: input.reviews[0]?.startedAt ?? null,
      latestStartedAtIso: nullableIso(input.reviews[0]?.startedAt ?? null),
    },
  };
}

export function buildDiagnosticsPayload(input: {
  events: DiagnosticEvent[];
  filters: {
    deploymentId: number | null;
    targetType: DeploymentTargetType | null;
    targetNumber: number | null;
    limit: number;
  };
}): unknown {
  return {
    events: input.events.map((event) => ({
      ...event,
      timestampIso: toIso(event.timestamp),
      targetLabel: event.targetType && event.targetNumber !== null
        ? targetLabel(event.targetType, event.targetNumber)
        : null,
    })),
    filters: input.filters,
    summary: {
      count: input.events.length,
      levelCounts: countBy(input.events, (event) => event.level),
      latestTimestamp: input.events[0]?.timestamp ?? null,
      latestTimestampIso: nullableIso(input.events[0]?.timestamp ?? null),
    },
  };
}

export function targetLabel(targetType: DeploymentTargetType, targetNumber: number): string {
  return targetType === "pr" ? `PR #${targetNumber}` : `Issue #${targetNumber}`;
}

export function parseLimit(value: string | null, defaultValue: number, maxValue: number): number {
  if (value === null || value.trim() === "") return defaultValue;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(1, Math.min(maxValue, parsed));
}

export function parsePositiveInt(value: string | null): number | null | "invalid" {
  if (value === null || value.trim() === "") return null;
  if (!/^\d+$/.test(value.trim())) return "invalid";
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : "invalid";
}

export function parseTargetType(value: string | null): DeploymentTargetType | null | "invalid" {
  if (value === null || value.trim() === "") return null;
  return value === "issue" || value === "pr" ? value : "invalid";
}

function mobileDeployment(deployment: Deployment): unknown {
  return {
    id: deployment.id,
    repoId: deployment.repoId,
    targetType: deployment.targetType,
    targetNumber: deployment.targetNumber,
    targetLabel: targetLabel(deployment.targetType, deployment.targetNumber),
    issueNumber: deployment.issueNumber,
    branchName: deployment.branchName,
    agent: deployment.agent,
    workspaceMode: deployment.workspaceMode,
    workspacePath: deployment.workspacePath,
    linkedPrNumber: deployment.linkedPrNumber,
    state: deployment.state,
    terminalBackend: deployment.terminalBackend ?? "ttyd",
    triggeredBy: deployment.triggeredBy,
    parentDeploymentId: deployment.parentDeploymentId,
    webhookDepth: deployment.webhookDepth,
    launchedAt: deployment.launchedAt,
    endedAt: deployment.endedAt,
    terminalReason: deployment.terminalReason,
    ttydPort: deployment.ttydPort,
    idleSince: deployment.idleSince,
  };
}

function reviewRangeLabel(review: PrReview): string {
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

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function arrayLength(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

function countBy<T, K extends string>(items: T[], keyForItem: (item: T) => K): Record<K, number> {
  const counts = {} as Record<K, number>;
  for (const item of items) {
    const key = keyForItem(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function toIso(value: number): string {
  return new Date(value).toISOString();
}

function nullableIso(value: number | null): string | null {
  return value === null ? null : toIso(value);
}
