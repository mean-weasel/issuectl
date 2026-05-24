import {
  deletePushDevice,
  getDb,
  getDeploymentById,
  getRepoById,
  listPushDevicesForKind,
  recordDiagnosticEventSafely,
  type PushNotificationKind,
} from "@issuectl/core";
import log from "@/lib/logger";
import { sendApnsNotification, type ApnsPayload } from "./apns";

type PushEvent = {
  kind: PushNotificationKind;
  title: string;
  body: string;
  url?: string;
  data?: Record<string, unknown>;
};

type NotificationDeployment = {
  id: number;
  repoId: number;
  issueNumber: number | null;
  targetType?: "issue" | "pr";
  targetNumber?: number;
  triggeredBy?: "manual" | "webhook" | "comment_command";
  terminalReason?: string | null;
  completionResultJson?: string | null;
  endedAt: string | null;
};

type CompletionResult = {
  status?: string;
  summary?: string;
  finalHeadSha?: string;
  pushedCommitSha?: string;
};

export async function notifyDevices(event: PushEvent): Promise<void> {
  let devices;
  try {
    devices = listPushDevicesForKind(getDb(), event.kind);
  } catch (err) {
    log.error({ err, msg: "push_device_query_failed", kind: event.kind });
    return;
  }

  if (devices.length === 0) return;

  const payload: ApnsPayload = {
    aps: {
      alert: {
        title: event.title,
        body: event.body,
      },
      sound: "default",
    },
    type: event.kind,
    ...(event.url ? { url: event.url } : {}),
    ...(event.data ?? {}),
  };

  await Promise.all(devices.map(async (device) => {
    const result = await sendApnsNotification(device, payload);
    if (result.status === "sent") {
      log.info({ msg: "push_notification_sent", kind: event.kind, platform: device.platform });
      return;
    }

    log[result.status === "skipped" ? "debug" : "warn"]({
      msg: "push_notification_not_sent",
      kind: event.kind,
      platform: device.platform,
      result,
    });

    if (
      result.status === "failed" &&
      (result.statusCode === 400 || result.statusCode === 410) &&
      /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(result.reason)
    ) {
      try {
        deletePushDevice(getDb(), device.platform, device.token);
      } catch (err) {
        log.error({ err, msg: "push_device_delete_invalid_failed" });
      }
    }
  }));
}

export function notifyIdleTerminal(input: {
  owner: string;
  repo: string;
  issueNumber: number;
  deploymentId: number;
}): void {
  void notifyDevices({
    kind: "idleTerminals",
    title: "Terminal idle",
    body: `${input.owner}/${input.repo} #${input.issueNumber} has gone idle.`,
    url: `/issues/${input.owner}/${input.repo}/${input.issueNumber}`,
    data: input,
  });
}

export function notifyNewIssue(input: {
  owner: string;
  repo: string;
  issueNumber: number;
  title: string;
}): void {
  void notifyDevices({
    kind: "newIssues",
    title: "New issue",
    body: `${input.owner}/${input.repo} #${input.issueNumber}: ${input.title}`,
    url: `/issues/${input.owner}/${input.repo}/${input.issueNumber}`,
    data: input,
  });
}

export function notifyMergedPullRequest(input: {
  owner: string;
  repo: string;
  pullNumber: number;
  sha?: string;
}): void {
  void notifyDevices({
    kind: "mergedPullRequests",
    title: "Pull request merged",
    body: `${input.owner}/${input.repo} #${input.pullNumber} was merged.`,
    url: `/pulls/${input.owner}/${input.repo}/${input.pullNumber}`,
    data: input,
  });
}

export function notifyDeploymentTerminalOutcome(input: {
  deploymentId: number;
}): boolean {
  const db = getDb();
  const deployment = getDeploymentById(db, input.deploymentId);
  if (!shouldNotifyDeployment(deployment)) return false;
  const repo = getRepoById(db, deployment.repoId);
  if (!repo) return false;

  const targetType = deployment.targetType ?? "issue";
  const targetNumber = deployment.targetNumber ?? deployment.issueNumber;
  if (!targetNumber) return false;
  if (!claimDeploymentNotificationSentLocal(db, deployment.id)) return false;
  recordTerminalNotificationDiagnostic(db, repo, deployment, targetType, targetNumber);
  const targetLabel = targetType === "pr" ? "PR" : "issue";
  const outcome = terminalOutcome(deployment);
  void notifyDevices({
    kind: "idleTerminals",
    title: "Session ended",
    body: `${repo.owner}/${repo.name} ${targetLabel} #${targetNumber}: ${outcome.text}`,
    url: targetType === "pr"
      ? `/pulls/${repo.owner}/${repo.name}/${targetNumber}`
      : `/issues/${repo.owner}/${repo.name}/${targetNumber}`,
    data: {
      owner: repo.owner,
      repo: repo.name,
      deploymentId: deployment.id,
      targetType,
      targetNumber,
      terminalReason: deployment.terminalReason,
      completionStatus: outcome.status,
      finalHeadSha: outcome.result.finalHeadSha,
      pushedCommitSha: outcome.result.pushedCommitSha,
      triggeredBy: deployment.triggeredBy,
    },
  });
  return true;
}

function recordTerminalNotificationDiagnostic(
  db: ReturnType<typeof getDb>,
  repo: { owner: string; name: string },
  deployment: NotificationDeployment,
  targetType: "issue" | "pr",
  targetNumber: number,
): void {
  recordDiagnosticEventSafely(db, {
    level: "info",
    event: "webhook.notification_sent",
    source: "webhook-notifications",
    owner: repo.owner,
    repo: repo.name,
    issueNumber: targetType === "issue" ? targetNumber : undefined,
    deploymentId: deployment.id,
    status: terminalOutcome(deployment).status,
    data: {
      targetType,
      targetNumber,
      triggeredBy: deployment.triggeredBy,
      completion: terminalOutcome(deployment).result,
    },
  });
}

function shouldNotifyDeployment(
  deployment: unknown,
): deployment is NotificationDeployment {
  const candidate = deployment as NotificationDeployment | undefined;
  return Boolean(
    candidate &&
      candidate.endedAt !== null &&
      candidate.triggeredBy !== "manual",
  );
}

function claimDeploymentNotificationSentLocal(
  db: ReturnType<typeof getDb>,
  deploymentId: number,
): boolean {
  const result = db.prepare(
    "UPDATE deployments SET notification_sent_at = datetime('now') WHERE id = ? AND notification_sent_at IS NULL",
  ).run(deploymentId);
  return result.changes > 0;
}

function terminalOutcome(deployment: NotificationDeployment): {
  status: string;
  text: string;
  result: CompletionResult;
} {
  const result = parseCompletionResult(deployment.completionResultJson);
  const status = result.status ?? deployment.terminalReason ?? "ended";
  if (status === "pushed_fixes") {
    return { status, text: `pushed fixes${shortShaText(result.pushedCommitSha)}`, result };
  }
  if (status === "no_changes") return { status, text: "no changes", result };
  if (status === "failed") return { status, text: result.summary ? `failed: ${result.summary}` : "failed", result };
  return { status, text: result.summary || status, result };
}

function parseCompletionResult(value: string | null | undefined): CompletionResult {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as CompletionResult;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function shortShaText(value: string | undefined): string {
  return value ? ` (${value.slice(0, 7)})` : "";
}
