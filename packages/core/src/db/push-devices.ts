import type Database from "better-sqlite3";
import type {
  PushDevice,
  PushDeviceEnvironment,
  PushDevicePlatform,
  PushNotificationKind,
  PushNotificationPreferences,
} from "../types.js";

type PushDeviceRow = {
  id: number;
  platform: string;
  token: string;
  environment: string;
  idle_terminals: number;
  new_issues: number;
  merged_pull_requests: number;
  enabled: number;
  last_registered_at: string;
  created_at: string;
  updated_at: string;
};

export type PushDeviceInput = {
  platform: PushDevicePlatform;
  token: string;
  environment: PushDeviceEnvironment;
  preferences: PushNotificationPreferences;
  enabled?: boolean;
};

function rowToPushDevice(row: PushDeviceRow): PushDevice {
  return {
    id: row.id,
    platform: row.platform as PushDevicePlatform,
    token: row.token,
    environment: row.environment as PushDeviceEnvironment,
    preferences: {
      idleTerminals: row.idle_terminals === 1,
      newIssues: row.new_issues === 1,
      mergedPullRequests: row.merged_pull_requests === 1,
    },
    enabled: row.enabled === 1,
    lastRegisteredAt: row.last_registered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function upsertPushDevice(
  db: Database.Database,
  input: PushDeviceInput,
): PushDevice {
  db.prepare(
    `INSERT INTO push_devices (
       platform, token, environment, idle_terminals, new_issues,
       merged_pull_requests, enabled, last_registered_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(platform, token) DO UPDATE SET
       environment = excluded.environment,
       idle_terminals = excluded.idle_terminals,
       new_issues = excluded.new_issues,
       merged_pull_requests = excluded.merged_pull_requests,
       enabled = excluded.enabled,
       last_registered_at = datetime('now'),
       updated_at = datetime('now')`,
  ).run(
    input.platform,
    input.token,
    input.environment,
    input.preferences.idleTerminals ? 1 : 0,
    input.preferences.newIssues ? 1 : 0,
    input.preferences.mergedPullRequests ? 1 : 0,
    input.enabled === false ? 0 : 1,
  );

  const device = getPushDevice(db, input.platform, input.token);
  if (!device) throw new Error("Failed to read back push device after upsert");
  return device;
}

export function getPushDevice(
  db: Database.Database,
  platform: PushDevicePlatform,
  token: string,
): PushDevice | undefined {
  const row = db
    .prepare("SELECT * FROM push_devices WHERE platform = ? AND token = ?")
    .get(platform, token) as PushDeviceRow | undefined;
  return row ? rowToPushDevice(row) : undefined;
}

export function disablePushDevice(
  db: Database.Database,
  platform: PushDevicePlatform,
  token: string,
): boolean {
  const result = db
    .prepare(
      `UPDATE push_devices
       SET enabled = 0, updated_at = datetime('now')
       WHERE platform = ? AND token = ?`,
    )
    .run(platform, token);
  return result.changes > 0;
}

export function deletePushDevice(
  db: Database.Database,
  platform: PushDevicePlatform,
  token: string,
): boolean {
  const result = db
    .prepare("DELETE FROM push_devices WHERE platform = ? AND token = ?")
    .run(platform, token);
  return result.changes > 0;
}

export function listPushDevicesForKind(
  db: Database.Database,
  kind: PushNotificationKind,
): PushDevice[] {
  const column = {
    idleTerminals: "idle_terminals",
    newIssues: "new_issues",
    mergedPullRequests: "merged_pull_requests",
  }[kind];
  const rows = db
    .prepare(
      `SELECT * FROM push_devices
       WHERE enabled = 1 AND ${column} = 1
       ORDER BY last_registered_at DESC`,
    )
    .all() as PushDeviceRow[];
  return rows.map(rowToPushDevice);
}

export function listPushDevices(db: Database.Database): PushDevice[] {
  const rows = db
    .prepare("SELECT * FROM push_devices ORDER BY updated_at DESC")
    .all() as PushDeviceRow[];
  return rows.map(rowToPushDevice);
}
