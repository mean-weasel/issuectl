import { describe, expect, it } from "vitest";
import { createTestDb } from "./test-helpers.js";
import {
  deletePushDevice,
  disablePushDevice,
  listPushDevicesForKind,
  upsertPushDevice,
} from "./push-devices.js";

const token = "a".repeat(64);

describe("push devices", () => {
  it("upserts an iOS device and preferences", () => {
    const db = createTestDb();

    const device = upsertPushDevice(db, {
      platform: "ios",
      token,
      environment: "development",
      preferences: {
        idleTerminals: true,
        newIssues: false,
        mergedPullRequests: true,
      },
    });

    expect(device.platform).toBe("ios");
    expect(device.environment).toBe("development");
    expect(device.preferences).toEqual({
      idleTerminals: true,
      newIssues: false,
      mergedPullRequests: true,
    });

    const updated = upsertPushDevice(db, {
      platform: "ios",
      token,
      environment: "production",
      preferences: {
        idleTerminals: false,
        newIssues: true,
        mergedPullRequests: false,
      },
    });

    expect(updated.id).toBe(device.id);
    expect(updated.environment).toBe("production");
    expect(updated.preferences.newIssues).toBe(true);
  });

  it("lists only enabled devices that opted into a notification kind", () => {
    const db = createTestDb();
    upsertPushDevice(db, {
      platform: "ios",
      token,
      environment: "production",
      preferences: {
        idleTerminals: true,
        newIssues: false,
        mergedPullRequests: false,
      },
    });
    upsertPushDevice(db, {
      platform: "ios",
      token: "b".repeat(64),
      environment: "production",
      enabled: false,
      preferences: {
        idleTerminals: true,
        newIssues: true,
        mergedPullRequests: true,
      },
    });

    expect(listPushDevicesForKind(db, "idleTerminals").map((d) => d.token)).toEqual([token]);
    expect(listPushDevicesForKind(db, "newIssues")).toEqual([]);
  });

  it("can disable or delete a device", () => {
    const db = createTestDb();
    upsertPushDevice(db, {
      platform: "ios",
      token,
      environment: "production",
      preferences: {
        idleTerminals: true,
        newIssues: true,
        mergedPullRequests: true,
      },
    });

    expect(disablePushDevice(db, "ios", token)).toBe(true);
    expect(listPushDevicesForKind(db, "idleTerminals")).toEqual([]);
    expect(deletePushDevice(db, "ios", token)).toBe(true);
  });
});
