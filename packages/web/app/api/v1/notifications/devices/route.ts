import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  deletePushDevice,
  disablePushDevice,
  formatErrorForUser,
  getDb,
  upsertPushDevice,
  type PushDeviceEnvironment,
  type PushNotificationPreferences,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

type DeviceBody = {
  platform?: unknown;
  token?: unknown;
  environment?: unknown;
  enabled?: unknown;
  preferences?: Partial<Record<keyof PushNotificationPreferences, unknown>>;
};

function parseBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean`);
  }
  return value;
}

function parseToken(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 32 ||
    value.length % 2 !== 0 ||
    !/^[0-9a-fA-F]+$/.test(value)
  ) {
    throw new Error("token must be an even-length APNs token hex string");
  }
  return value.toLowerCase();
}

function parseBody(body: DeviceBody): {
  platform: "ios";
  token: string;
  environment: PushDeviceEnvironment;
  enabled: boolean;
  preferences: PushNotificationPreferences;
} {
  if (body.platform !== "ios") {
    throw new Error("platform must be ios");
  }
  const environment = body.environment ?? "production";
  if (environment !== "development" && environment !== "production") {
    throw new Error("environment must be development or production");
  }
  const preferences = body.preferences;
  if (!preferences || typeof preferences !== "object") {
    throw new Error("preferences are required");
  }

  return {
    platform: "ios",
    token: parseToken(body.token),
    environment,
    enabled: body.enabled === undefined ? true : parseBoolean(body.enabled, "enabled"),
    preferences: {
      idleTerminals: parseBoolean(preferences.idleTerminals, "preferences.idleTerminals"),
      newIssues: parseBoolean(preferences.newIssues, "preferences.newIssues"),
      mergedPullRequests: parseBoolean(
        preferences.mergedPullRequests,
        "preferences.mergedPullRequests",
      ),
    },
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  let parsed;
  try {
    parsed = parseBody(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid JSON body" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const device = upsertPushDevice(db, parsed);
    log.info({
      msg: "push_device_registered",
      platform: device.platform,
      environment: device.environment,
      enabled: device.enabled,
    });
    return NextResponse.json({
      success: true,
      device: {
        id: device.id,
        platform: device.platform,
        environment: device.environment,
        preferences: device.preferences,
        enabled: device.enabled,
        lastRegisteredAt: device.lastRegisteredAt,
      },
    });
  } catch (err) {
    log.error({ err, msg: "push_device_register_failed" });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  let body: DeviceBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.platform !== "ios") {
    return NextResponse.json({ error: "platform must be ios" }, { status: 400 });
  }
  let token: string;
  try {
    token = parseToken(body.token);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid token" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const removed = request.nextUrl.searchParams.get("hard") === "true"
      ? deletePushDevice(db, "ios", token)
      : disablePushDevice(db, "ios", token);
    return NextResponse.json({ success: true, removed });
  } catch (err) {
    log.error({ err, msg: "push_device_delete_failed" });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}
