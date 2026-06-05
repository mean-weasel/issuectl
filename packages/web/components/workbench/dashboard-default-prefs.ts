import { DASHBOARD_PRESETS, type DashboardPresetId } from "./dashboard-presets";
import type { DashboardSurface } from "./dashboard-url-state";

const DEFAULT_PRESET_STORAGE_KEYS: Record<DashboardSurface, string> = {
  board: "issuectl.dashboard.defaultPreset.board",
  globalIssues: "issuectl.dashboard.defaultPreset.globalIssues",
};

const PRESET_IDS = new Set<DashboardPresetId>(DASHBOARD_PRESETS.map((preset) => preset.id));

export function readDashboardDefaultPreset(
  surface: DashboardSurface,
  storage: Storage | null | undefined = globalStorage(),
): DashboardPresetId | null {
  try {
    const value = storage?.getItem(DEFAULT_PRESET_STORAGE_KEYS[surface]) ?? null;
    return value && PRESET_IDS.has(value as DashboardPresetId) ? value as DashboardPresetId : null;
  } catch {
    return null;
  }
}

export function writeDashboardDefaultPreset(
  surface: DashboardSurface,
  presetId: DashboardPresetId,
  storage: Storage | null | undefined = globalStorage(),
): void {
  try {
    storage?.setItem(DEFAULT_PRESET_STORAGE_KEYS[surface], presetId);
  } catch {
    // Ignore localStorage failures; defaults are a convenience, not required state.
  }
}

function globalStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}
