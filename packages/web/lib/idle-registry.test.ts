import { describe, it, expect, beforeEach } from "vitest";
import {
  registerPort,
  unregisterPort,
  recordPtyOutput,
  getLastPtyOutput,
  getRegisteredPorts,
} from "./idle-registry";

describe("idle-registry", () => {
  beforeEach(() => {
    // Clear all registrations between tests
    for (const port of getRegisteredPorts()) {
      unregisterPort(port);
    }
  });

  it("registerPort creates an entry with the given timestamp", () => {
    registerPort(7700, 1000);
    expect(getLastPtyOutput(7700)).toBe(1000);
  });

  it("unregisterPort removes the entry", () => {
    registerPort(7700, 1000);
    unregisterPort(7700);
    expect(getLastPtyOutput(7700)).toBeUndefined();
  });

  it("recordPtyOutput updates the timestamp", () => {
    registerPort(7700, 1000);
    recordPtyOutput(7700, 2000);
    expect(getLastPtyOutput(7700)).toBe(2000);
  });

  it("recordPtyOutput is a no-op for unregistered ports", () => {
    recordPtyOutput(7700, 2000);
    expect(getLastPtyOutput(7700)).toBeUndefined();
  });

  it("getRegisteredPorts returns all active ports", () => {
    registerPort(7700, 1000);
    registerPort(7701, 1000);
    expect(getRegisteredPorts()).toEqual([7700, 7701]);
  });
});
