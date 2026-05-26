/* eslint-disable max-lines */
import {
  dbExists,
  getActiveDeployments,
  getDb,
  listPrReviewsForRepo,
  listRecentTerminalDeploymentsByRepo,
  listRepos,
  type ActiveDeploymentWithRepo,
  type Deployment,
  type DeploymentTargetType,
  type DeploymentTriggeredBy,
  type PrReview,
  type PrReviewStatus,
  type Repo,
} from "@issuectl/core";
import { getSessionPreviews, type SessionPreview } from "@/lib/session-previews";

export type SessionsTab = "sessions" | "reviews";
export type SessionsStateFilter = "active" | "ended" | "all";
export type TriggerFilter = DeploymentTriggeredBy | "all";
export type ReviewStatusFilter = PrReviewStatus | "all";

export type SessionsFilters = {
  tab: SessionsTab;
  q: string;
  repo: string;
  trigger: TriggerFilter;
  state: SessionsStateFilter;
  status: ReviewStatusFilter;
};

export type SessionListItem = {
  id: number;
  repoId: number;
  repoFullName: string;
  owner: string;
  repoName: string;
  targetType: DeploymentTargetType;
  targetNumber: number;
  targetLabel: string;
  issueNumber: number | null;
  branchName: string;
  agent: string;
  workspaceMode: string;
  workspacePath: string;
  linkedPrNumber: number | null;
  triggeredBy: DeploymentTriggeredBy;
  parentDeploymentId: number | null;
  childDeploymentCount: number;
  webhookDepth: number;
  terminalReason: string | null;
  launchedAt: string;
  endedAt: string | null;
  ttydPort: number | null;
  idleSince: string | null;
  preview: SessionPreview | null;
  provenanceLabel?: string;
  elapsedLabel?: string;
};

export type SessionTargetGroup = {
  key: string;
  repoFullName: string;
  targetType: DeploymentTargetType;
  targetNumber: number;
  targetLabel: string;
  sessions: SessionListItem[];
  matchingSessionCount?: number;
};

export type ReviewRunItem = PrReview & {
  repoFullName: string;
  owner: string;
  repoName: string;
  deployment: SessionListItem | null;
  result: Record<string, unknown>;
  summary: string | null;
  findingCount: number | null;
  rangeLabel: string;
  detailHref: string;
  provenanceLabel?: string;
  elapsedLabel?: string;
};

export type ReviewPrGroup = {
  key: string;
  repoFullName: string;
  owner: string;
  repoName: string;
  prNumber: number;
  runs: ReviewRunItem[];
  matchingRunCount?: number;
};

export type SessionsOverviewData = {
  initialized: boolean;
  filters: SessionsFilters;
  repos: Array<{ id: number; fullName: string }>;
  sessionGroups: SessionTargetGroup[];
  reviewGroups: ReviewPrGroup[];
  summary: {
    activeSessions: number;
    endedSessions: number;
    reviewRuns: number;
    activeReviewRuns: number;
  };
};

type BuildInput = {
  repos: Repo[];
  activeDeployments: ActiveDeploymentWithRepo[];
  recentDeploymentsByRepo: Map<number, Deployment[]>;
  reviewsByRepo: Map<number, PrReview[]>;
  previews: Record<string, SessionPreview>;
  filters: SessionsFilters;
};

const SESSION_STATES: SessionsStateFilter[] = ["active", "ended", "all"];
const TRIGGERS: TriggerFilter[] = ["manual", "webhook", "comment_command", "all"];
const REVIEW_STATUSES: ReviewStatusFilter[] = [
  "reserved",
  "launching",
  "in_progress",
  "completed",
  "failed",
  "superseded",
  "all",
];
const ACTIVE_REVIEW_STATUSES = new Set<PrReviewStatus>(["reserved", "launching", "in_progress"]);

export async function getSessionsOverviewData(filters: SessionsFilters): Promise<SessionsOverviewData> {
  if (!dbExists()) {
    return emptySessionsOverview(filters);
  }

  const db = getDb();
  const repos = listRepos(db);
  const activeDeployments = getActiveDeployments(db);
  const previews = await getSessionPreviews(activeDeployments);
  const recentDeploymentsByRepo = new Map<number, Deployment[]>();
  const reviewsByRepo = new Map<number, PrReview[]>();

  for (const repo of repos) {
    recentDeploymentsByRepo.set(repo.id, listRecentTerminalDeploymentsByRepo(db, repo.id, 12));
    reviewsByRepo.set(repo.id, listPrReviewsForRepo(db, repo.id, 24));
  }

  return buildSessionsOverview({
    repos,
    activeDeployments,
    recentDeploymentsByRepo,
    reviewsByRepo,
    previews,
    filters,
  });
}

export function normalizeSessionsFilters(input: Record<string, string | string[] | undefined>): SessionsFilters {
  const first = (value: string | string[] | undefined): string => Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const tab = first(input.tab);
  const state = first(input.state);
  const trigger = first(input.trigger);
  const status = first(input.status);
  return {
    tab: tab === "reviews" ? "reviews" : "sessions",
    q: first(input.q).trim(),
    repo: first(input.repo).trim(),
    trigger: isOneOf(trigger, TRIGGERS) ? trigger : "all",
    state: isOneOf(state, SESSION_STATES) ? state : "all",
    status: isOneOf(status, REVIEW_STATUSES) ? status : "all",
  };
}

export function buildSessionsOverview(input: BuildInput): SessionsOverviewData {
  const rawSessions = input.repos.flatMap((repo) => [
    ...input.activeDeployments.filter((deployment) => deployment.repoId === repo.id),
    ...(input.recentDeploymentsByRepo.get(repo.id) ?? []),
  ].map((deployment) => ({ repo, deployment })));
  const childCounts = deploymentChildCounts(rawSessions.map((item) => item.deployment));
  const sessions = rawSessions.map(({ repo, deployment }) =>
    sessionFromDeployment(repo, deployment, input.previews, childCounts),
  );
  const reviews = input.repos.flatMap((repo) =>
    (input.reviewsByRepo.get(repo.id) ?? []).map((review) =>
      reviewFromRun(repo, review, sessions.find((session) => session.id === review.deploymentId) ?? null),
    ),
  );

  return {
    initialized: true,
    filters: input.filters,
    repos: input.repos.map((repo) => ({ id: repo.id, fullName: repoFullName(repo) })),
    sessionGroups: groupSessions(sessions, input.filters),
    reviewGroups: groupReviews(reviews, input.filters),
    summary: {
      activeSessions: sessions.filter((session) => !session.endedAt).length,
      endedSessions: sessions.filter((session) => session.endedAt).length,
      reviewRuns: reviews.length,
      activeReviewRuns: reviews.filter((review) => ACTIVE_REVIEW_STATUSES.has(review.status)).length,
    },
  };
}

function emptySessionsOverview(filters: SessionsFilters): SessionsOverviewData {
  return {
    initialized: false,
    filters,
    repos: [],
    sessionGroups: [],
    reviewGroups: [],
    summary: { activeSessions: 0, endedSessions: 0, reviewRuns: 0, activeReviewRuns: 0 },
  };
}

function sessionFromDeployment(
  repo: Repo,
  deployment: Deployment | ActiveDeploymentWithRepo,
  previews: Record<string, SessionPreview>,
  childCounts: Map<number, number>,
): SessionListItem {
  const preview = deployment.ttydPort === null ? null : previews[String(deployment.ttydPort)] ?? null;
  return {
    id: deployment.id,
    repoId: deployment.repoId,
    repoFullName: repoFullName(repo),
    owner: repo.owner,
    repoName: repo.name,
    targetType: deployment.targetType,
    targetNumber: deployment.targetNumber,
    targetLabel: targetLabel(deployment.targetType, deployment.targetNumber),
    issueNumber: deployment.issueNumber,
    branchName: deployment.branchName,
    agent: deployment.agent,
    workspaceMode: deployment.workspaceMode,
    workspacePath: deployment.workspacePath,
    linkedPrNumber: deployment.linkedPrNumber,
    triggeredBy: deployment.triggeredBy,
    parentDeploymentId: deployment.parentDeploymentId,
    childDeploymentCount: childCounts.get(deployment.id) ?? 0,
    webhookDepth: deployment.webhookDepth,
    terminalReason: deployment.terminalReason,
    launchedAt: deployment.launchedAt,
    endedAt: deployment.endedAt,
    ttydPort: deployment.ttydPort,
    idleSince: deployment.idleSince,
    preview,
    provenanceLabel: sessionProvenance(deployment),
    elapsedLabel: elapsedLabel(Date.parse(deployment.launchedAt), deployment.endedAt ? Date.parse(deployment.endedAt) : Date.now()),
  };
}

function reviewFromRun(repo: Repo, review: PrReview, deployment: SessionListItem | null): ReviewRunItem {
  const result = parseJsonObject(review.resultJson);
  return {
    ...review,
    repoFullName: repoFullName(repo),
    owner: repo.owner,
    repoName: repo.name,
    deployment,
    result,
    summary: stringValue(result.summary) ?? stringValue(result.reason) ?? stringValue(result.error) ?? null,
    findingCount: numberValue(result.findingCount)
      ?? numberValue(result.fixedFindingCount)
      ?? arrayLength(result.findings)
      ?? arrayLength(result.comments),
    rangeLabel: reviewRangeLabel(review),
    detailHref: `/reviews/${review.id}`,
    provenanceLabel: reviewProvenance(review, deployment),
    elapsedLabel: elapsedLabel(review.startedAt, review.completedAt ?? Date.now()),
  };
}

function groupSessions(sessions: SessionListItem[], filters: SessionsFilters): SessionTargetGroup[] {
  const groups = new Map<string, SessionTargetGroup>();
  for (const session of sessions) {
    const key = `${session.repoId}:${session.targetType}:${session.targetNumber}`;
    const group = groups.get(key) ?? {
      key,
      repoFullName: session.repoFullName,
      targetType: session.targetType,
      targetNumber: session.targetNumber,
      targetLabel: session.targetLabel,
      sessions: [],
      matchingSessionCount: 0,
    };
    group.sessions.push(session);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      sessions: [...group.sessions].sort(compareSessions),
      matchingSessionCount: group.sessions.filter((session) => sessionMatchesFilters(session, filters)).length,
    }))
    .filter((group) => group.matchingSessionCount > 0)
    .sort((left, right) => compareSessions(left.sessions[0], right.sessions[0]));
}

function groupReviews(reviews: ReviewRunItem[], filters: SessionsFilters): ReviewPrGroup[] {
  const groups = new Map<string, ReviewPrGroup>();
  for (const review of reviews) {
    const key = `${review.repoId}:${review.prNumber}`;
    const group = groups.get(key) ?? {
      key,
      repoFullName: review.repoFullName,
      owner: review.owner,
      repoName: review.repoName,
      prNumber: review.prNumber,
      runs: [],
      matchingRunCount: 0,
    };
    group.runs.push(review);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      runs: [...group.runs].sort((left, right) => right.startedAt - left.startedAt || right.id - left.id),
      matchingRunCount: group.runs.filter((review) => reviewMatchesFilters(review, filters)).length,
    }))
    .filter((group) => group.matchingRunCount > 0)
    .sort((left, right) => right.runs[0].startedAt - left.runs[0].startedAt || right.runs[0].id - left.runs[0].id);
}

function sessionMatchesFilters(session: SessionListItem, filters: SessionsFilters): boolean {
  if (filters.repo && session.repoFullName !== filters.repo) return false;
  if (filters.trigger !== "all" && session.triggeredBy !== filters.trigger) return false;
  if (filters.state === "active" && session.endedAt) return false;
  if (filters.state === "ended" && !session.endedAt) return false;
  if (!filters.q) return true;
  return searchable([
    session.repoFullName,
    session.targetLabel,
    session.branchName,
    session.agent,
    session.triggeredBy,
    session.provenanceLabel ?? "",
    session.terminalReason ?? "",
    session.preview?.lines.join(" ") ?? "",
  ]).includes(filters.q.toLowerCase());
}

function reviewMatchesFilters(review: ReviewRunItem, filters: SessionsFilters): boolean {
  if (filters.repo && review.repoFullName !== filters.repo) return false;
  if (filters.trigger !== "all" && review.triggeredBy !== filters.trigger) return false;
  if (filters.status !== "all" && review.status !== filters.status) return false;
  if (!filters.q) return true;
  return searchable([
    review.repoFullName,
    `PR #${review.prNumber}`,
    review.status,
    review.triggeredBy,
    review.provenanceLabel ?? "",
    review.headRepoFullName,
    review.headRef,
    review.reviewedFromSha ?? "",
    review.reviewedToSha,
    review.deployment?.branchName ?? "",
  ]).includes(filters.q.toLowerCase());
}

function compareSessions(left: SessionListItem | undefined, right: SessionListItem | undefined): number {
  if (!left || !right) return 0;
  const leftActive = left.endedAt ? 1 : 0;
  const rightActive = right.endedAt ? 1 : 0;
  return leftActive - rightActive
    || Date.parse(right.launchedAt) - Date.parse(left.launchedAt)
    || right.id - left.id;
}

function targetLabel(targetType: DeploymentTargetType, targetNumber: number): string {
  return targetType === "pr" ? `PR #${targetNumber}` : `Issue #${targetNumber}`;
}

function repoFullName(repo: Repo): string {
  return `${repo.owner}/${repo.name}`;
}

function deploymentChildCounts(deployments: Array<Deployment | ActiveDeploymentWithRepo>): Map<number, number> {
  const counts = new Map<number, number>();
  for (const deployment of deployments) {
    if (deployment.parentDeploymentId === null) continue;
    counts.set(deployment.parentDeploymentId, (counts.get(deployment.parentDeploymentId) ?? 0) + 1);
  }
  return counts;
}

function reviewRangeLabel(review: PrReview): string {
  if (review.reviewedFromSha) return `${shortSha(review.reviewedFromSha)}..${shortSha(review.reviewedToSha)}`;
  return `full ${shortSha(review.reviewedToSha)}`;
}

function sessionProvenance(deployment: Deployment | ActiveDeploymentWithRepo): string {
  const trigger = deployment.triggeredBy === "comment_command" ? "comment command" : deployment.triggeredBy;
  const lineage = deployment.parentDeploymentId ? `child of session #${deployment.parentDeploymentId}` : "root session";
  return `${trigger} · ${lineage}`;
}

function reviewProvenance(review: PrReview, deployment: SessionListItem | null): string {
  const trigger = review.triggeredBy === "comment_command" ? "comment command" : review.triggeredBy;
  const session = deployment ? `session #${deployment.id}` : "no linked session";
  return `${trigger} · ${session}`;
}

function elapsedLabel(startMs: number, endMs: number): string {
  const minutes = Math.max(0, Math.round((endMs - startMs) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
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

function searchable(parts: string[]): string {
  return parts.join(" ").toLowerCase();
}

function isOneOf<T extends string>(value: string, options: readonly T[]): value is T {
  return options.includes(value as T);
}
