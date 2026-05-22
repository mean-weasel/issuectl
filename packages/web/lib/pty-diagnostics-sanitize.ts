export function sanitizePtyData(data: Record<string, unknown> | undefined): Record<string, number | boolean | string> | null {
  if (!data) return null;
  const safe: Record<string, number | boolean | string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!SAFE_PTY_DATA_KEYS.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) safe[key] = value;
    if (typeof value === "boolean") safe[key] = value;
    if (typeof value === "string" && key === "signal") safe[key] = value;
  }
  return Object.keys(safe).length ? safe : null;
}

const SAFE_PTY_DATA_KEYS = new Set([
  "activeWs",
  "backpressureDrops",
  "bufferedBytes",
  "bytesFromClient",
  "bytesToClient",
  "cols",
  "durationMs",
  "exitCode",
  "framesFromClient",
  "framesToClient",
  "peakBuffered",
  "rows",
  "signal",
]);
