import {
  deletePushDevice,
  getDb,
  listPushDevicesForKind,
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
