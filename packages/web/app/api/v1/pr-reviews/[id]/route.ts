import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { buildDiagnosticsPayload, repoFullName, targetLabel } from "@/lib/mobile-api-contracts";
import { getReviewDetailData, type ReviewDetailData, type ReviewLineageItem } from "@/lib/review-detail-data";
import { formatErrorForUser, type Deployment, type PrReview } from "@issuectl/core";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { id } = await params;
  const reviewId = parseReviewId(id);
  if (reviewId === null) {
    return NextResponse.json({ error: "Invalid review id" }, { status: 400 });
  }

  try {
    const data = getReviewDetailData(reviewId);
    if (!data) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }
    return NextResponse.json(buildPrReviewDetailPayload(data));
  } catch (err) {
    log.error({ err, msg: "api_pr_review_detail_failed", reviewId });
    return NextResponse.json({ error: formatErrorForUser(err) }, { status: 500 });
  }
}

function parseReviewId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildPrReviewDetailPayload(data: ReviewDetailData): unknown {
  const fullName = repoFullName(data.repo);
  return {
    review: mobileReview(data.review, data.deployment, fullName),
    repo: {
      id: data.repo.id,
      fullName,
      owner: data.repo.owner,
      name: data.repo.name,
    },
    deployment: data.deployment ? mobileDeployment(data.deployment) : null,
    lineage: data.lineage.map((item) => mobileLineageItem(item)),
    diagnostics: buildDiagnosticsPayload({
      events: data.diagnostics,
      filters: {
        deploymentId: data.deployment?.id ?? null,
        targetType: "pr",
        targetNumber: data.review.prNumber,
        limit: data.diagnostics.length,
      },
    }),
    findings: mobileFindings(data.result),
    banners: data.banners,
    metadata: data.metadata,
    actions: {
      ...data.actions,
      mobileWriteActionsEnabled: false,
    },
    links: data.links,
  };
}

function mobileReview(review: PrReview, deployment: Deployment | null, fullName: string): unknown {
  const result = parseJsonObject(review.resultJson);
  return {
    id: review.id,
    repoId: review.repoId,
    repoFullName: fullName,
    owner: ownerFromFullName(fullName),
    repoName: repoNameFromFullName(fullName),
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
    summary: reviewSummary(result),
    findingCount: findingCount(result),
    rangeLabel: reviewRangeLabel(review),
    detailHref: `/reviews/${review.id}`,
    startedAt: review.startedAt,
    startedAtIso: toIso(review.startedAt),
    completedAt: review.completedAt,
    completedAtIso: nullableIso(review.completedAt),
    deployment: deployment ? mobileDeployment(deployment) : null,
  };
}

function mobileLineageItem(item: ReviewLineageItem): unknown {
  return {
    id: item.id,
    active: item.active,
    label: item.label,
    status: item.status,
    triggeredBy: item.triggeredBy,
    deploymentId: item.deploymentId,
    reviewedFromSha: item.reviewedFromSha,
    reviewedToSha: item.reviewedToSha,
    result: item.result,
    summary: reviewSummary(item.result),
    startedAt: item.startedAt,
    startedAtIso: toIso(item.startedAt),
    completedAt: item.completedAt,
    completedAtIso: nullableIso(item.completedAt),
  };
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

function mobileFindings(result: Record<string, unknown>): unknown[] {
  const rawFindings = arrayValue(result.findings) ?? arrayValue(result.comments) ?? [];
  return rawFindings
    .map((item, index) => mobileFinding(item, index))
    .filter((item) => item !== null);
}

function mobileFinding(item: unknown, index: number): Record<string, unknown> | null {
  if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
  const finding = item as Record<string, unknown>;
  const path = stringValue(finding.path)
    ?? stringValue(finding.file)
    ?? stringValue(finding.filePath)
    ?? stringValue(finding.file_path)
    ?? stringValue(finding.filename);
  const line = numberValue(finding.line)
    ?? numberValue(finding.startLine)
    ?? numberValue(finding.start_line)
    ?? numberValue(finding.originalLine)
    ?? numberValue(finding.original_line);
  const body = stringValue(finding.body)
    ?? stringValue(finding.message)
    ?? stringValue(finding.comment)
    ?? stringValue(finding.description);
  const title = stringValue(finding.title)
    ?? stringValue(finding.rule)
    ?? firstLine(body)
    ?? (path ? `${path}${line ? `:${line}` : ""}` : `Finding ${index + 1}`);
  return {
    id: stringValue(finding.id) ?? `${path ?? "finding"}-${line ?? index}`,
    title,
    body: body ?? null,
    path: path ?? null,
    line: line ?? null,
    severity: stringValue(finding.severity) ?? stringValue(finding.level) ?? null,
    htmlUrl: stringValue(finding.htmlUrl) ?? stringValue(finding.html_url) ?? stringValue(finding.url) ?? null,
  };
}

function reviewSummary(result: Record<string, unknown>): string | null {
  return stringValue(result.summary) ?? stringValue(result.reason) ?? stringValue(result.error) ?? null;
}

function findingCount(result: Record<string, unknown>): number | null {
  return numberValue(result.findingCount)
    ?? numberValue(result.fixedFindingCount)
    ?? arrayLength(result.findings)
    ?? arrayLength(result.comments);
}

function reviewRangeLabel(review: PrReview): string {
  if (review.reviewedFromSha) return `${shortSha(review.reviewedFromSha)}..${shortSha(review.reviewedToSha)}`;
  return `full ${shortSha(review.reviewedToSha)}`;
}

function ownerFromFullName(value: string): string | null {
  return value.split("/")[0] ?? null;
}

function repoNameFromFullName(value: string): string | null {
  return value.split("/")[1] ?? null;
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

function arrayValue(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function firstLine(value: string | undefined): string | undefined {
  return value?.split(/\r?\n/, 1)[0];
}

function toIso(value: number): string {
  return new Date(value).toISOString();
}

function nullableIso(value: number | null): string | null {
  return value === null ? null : toIso(value);
}
