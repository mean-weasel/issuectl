import type {
  BoardUrlState,
  GlobalIssueUrlState,
} from "./dashboard-url-state";

export type DashboardPresetId = "attention" | "active" | "cached" | "errors";

export type DashboardPreset = {
  id: DashboardPresetId;
  label: string;
  description: string;
};

export const DASHBOARD_PRESETS: DashboardPreset[] = [
  {
    id: "attention",
    label: "Needs attention",
    description: "High-priority issues plus repos with fetch problems.",
  },
  {
    id: "active",
    label: "Active work",
    description: "Issues with running sessions.",
  },
  {
    id: "cached",
    label: "Stale cache",
    description: "Repos currently showing cached issue data.",
  },
  {
    id: "errors",
    label: "Broken repos",
    description: "Repos where issue fetches are failing.",
  },
];

export function globalIssuePresetState(id: DashboardPresetId): GlobalIssueUrlState {
  switch (id) {
    case "attention":
      return { view: "attention", status: "all", sort: "priority", query: "" };
    case "active":
      return { view: "running", status: "running", sort: "updated", query: "" };
    case "cached":
      return { view: "cached", status: "all", sort: "updated", query: "" };
    case "errors":
      return { view: "errors", status: "all", sort: "updated", query: "" };
  }
}

export function boardPresetState(id: DashboardPresetId): BoardUrlState {
  switch (id) {
    case "attention":
      return { view: "attention", sort: "priority", runningOnly: false, query: "" };
    case "active":
      return { view: "running", sort: "payload", runningOnly: true, query: "" };
    case "cached":
      return { view: "cached", sort: "payload", runningOnly: false, query: "" };
    case "errors":
      return { view: "errors", sort: "payload", runningOnly: false, query: "" };
  }
}

export function globalIssuePresetIdForState(state: GlobalIssueUrlState): DashboardPresetId | null {
  return presetIdForState(state, globalIssuePresetState);
}

export function boardPresetIdForState(state: BoardUrlState): DashboardPresetId | null {
  return presetIdForState(state, boardPresetState);
}

function presetIdForState<TState>(
  state: TState,
  presetState: (id: DashboardPresetId) => TState,
): DashboardPresetId | null {
  return DASHBOARD_PRESETS.find((preset) =>
    JSON.stringify(presetState(preset.id)) === JSON.stringify(state),
  )?.id ?? null;
}
