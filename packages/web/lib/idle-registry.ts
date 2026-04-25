/**
 * In-memory registry mapping ttyd port numbers to the timestamp (ms)
 * of the last PTY output frame seen on that port's WebSocket connection.
 * The idle checker reads this to decide which deployments have gone idle.
 *
 * This is intentionally not persisted — if the server restarts, all
 * connections are lost anyway, so there's nothing to mark idle.
 */

const registry = new Map<number, number>();

export function registerPort(port: number, nowMs: number): void {
  registry.set(port, nowMs);
}

export function unregisterPort(port: number): void {
  registry.delete(port);
}

export function recordPtyOutput(port: number, nowMs: number): void {
  if (registry.has(port)) {
    registry.set(port, nowMs);
  }
}

export function getLastPtyOutput(port: number): number | undefined {
  return registry.get(port);
}

export function getRegisteredPorts(): number[] {
  return [...registry.keys()];
}
