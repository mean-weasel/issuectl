import type {
  WorkbenchDeployment,
  WorkbenchIssueSummary,
  WorkbenchPayload,
  WorkbenchPreview,
  WorkbenchRepo,
} from "./workbench-types";

export type WorkbenchMode =
  | "workbench"
  | "globalIssues"
  | "board"
  | "pullRequests"
  | "quickCreate"
  | "settings";

export type WorkbenchSelectionState = {
  mode: WorkbenchMode;
  selectedRepoId: number | null;
  selectedIssueNumber: number | null;
  selectedDeploymentId: number | null;
  columnWidths: WorkbenchColumnWidths;
  collapsedSections: WorkbenchSectionCollapseState;
};

export type SessionSortMode = "running first" | "recent" | "kind";
export type IssueQueueFilter = "open" | "running" | "closed";
export type WorkbenchColumnKey = "instances" | "issues";
export type WorkbenchColumnWidths = Record<WorkbenchColumnKey, number>;
export type WorkbenchSectionId =
  | "issueSessions"
  | "namedShells"
  | "issueContext"
  | "issueComments"
  | "issueLinkedPrs"
  | "issueLaunchOptions"
  | "settingsHealth"
  | "settingsLaunchDefaults";
export type WorkbenchSectionCollapseState = Record<WorkbenchSectionId, boolean>;

export const WORKBENCH_COLUMN_WIDTH_STORAGE_KEY = "issuectl.workbench.columnWidths";
export const WORKBENCH_COLUMN_WIDTH_LIMITS: Record<WorkbenchColumnKey, { min: number; max: number; default: number }> = {
  instances: { min: 220, max: 360, default: 284 },
  issues: { min: 260, max: 420, default: 348 },
};
export const WORKBENCH_FOCUS_MIN_WIDTH = 440;
export const DEFAULT_WORKBENCH_COLUMN_WIDTHS: WorkbenchColumnWidths = {
  instances: WORKBENCH_COLUMN_WIDTH_LIMITS.instances.default,
  issues: WORKBENCH_COLUMN_WIDTH_LIMITS.issues.default,
};
export const DEFAULT_WORKBENCH_SECTION_COLLAPSE_STATE: WorkbenchSectionCollapseState = {
  issueSessions: false,
  namedShells: false,
  issueContext: false,
  issueComments: false,
  issueLinkedPrs: false,
  issueLaunchOptions: false,
  settingsHealth: false,
  settingsLaunchDefaults: false,
};

const PREVIEW_STATUS_RANK: Record<WorkbenchPreview["status"], number> = {
  active: 0,
  error: 1,
  unavailable: 2,
  idle: 3,
};

export type WorkbenchAction =
  | { type: "payloadLoaded"; payload: WorkbenchPayload }
  | { type: "selectRepo"; repoId: number }
  | { type: "selectMode"; mode: WorkbenchMode }
  | { type: "selectIssue"; issueNumber: number }
  | { type: "selectDeployment"; deploymentId: number }
  | { type: "replaceSelectedRepo"; repoId: number | null }
  | { type: "setColumnWidth"; column: WorkbenchColumnKey; width: number }
  | { type: "setColumnWidths"; widths: Partial<WorkbenchColumnWidths> }
  | { type: "resetColumnWidths" }
  | { type: "toggleSection"; section: WorkbenchSectionId }
  | { type: "clearRepo" }
  | { type: "clearDeployment" };

export function createWorkbenchState(
  payload: WorkbenchPayload,
  mode: WorkbenchMode = "workbench",
): WorkbenchSelectionState {
  return {
    mode,
    selectedRepoId: payload.repos[0]?.id ?? null,
    selectedIssueNumber: null,
    selectedDeploymentId: null,
    columnWidths: DEFAULT_WORKBENCH_COLUMN_WIDTHS,
    collapsedSections: DEFAULT_WORKBENCH_SECTION_COLLAPSE_STATE,
  };
}

export function workbenchReducer(
  state: WorkbenchSelectionState,
  action: WorkbenchAction,
): WorkbenchSelectionState {
  switch (action.type) {
    case "payloadLoaded": {
      const repoIds = new Set(action.payload.repos.map((repo) => repo.id));
      return {
        ...state,
        selectedRepoId: state.selectedRepoId && repoIds.has(state.selectedRepoId)
          ? state.selectedRepoId
          : action.payload.repos[0]?.id ?? null,
      };
    }
    case "selectRepo":
      return {
        ...state,
        mode: "workbench",
        selectedRepoId: action.repoId,
        selectedIssueNumber: null,
        selectedDeploymentId: null,
      };
    case "selectMode":
      return {
        ...state,
        mode: action.mode,
      };
    case "selectIssue":
      return {
        ...state,
        mode: "workbench",
        selectedIssueNumber: action.issueNumber,
        selectedDeploymentId: null,
      };
    case "selectDeployment":
      return {
        ...state,
        mode: "workbench",
        selectedDeploymentId: action.deploymentId,
        selectedIssueNumber: null,
      };
    case "replaceSelectedRepo":
      return {
        ...state,
        selectedRepoId: action.repoId,
        selectedIssueNumber: null,
        selectedDeploymentId: null,
      };
    case "setColumnWidth":
      return {
        ...state,
        columnWidths: clampWorkbenchColumnWidths({
          ...state.columnWidths,
          [action.column]: action.width,
        }),
      };
    case "setColumnWidths":
      return {
        ...state,
        columnWidths: clampWorkbenchColumnWidths({
          ...state.columnWidths,
          ...action.widths,
        }),
      };
    case "resetColumnWidths":
      return {
        ...state,
        columnWidths: DEFAULT_WORKBENCH_COLUMN_WIDTHS,
      };
    case "toggleSection":
      return {
        ...state,
        collapsedSections: {
          ...state.collapsedSections,
          [action.section]: !state.collapsedSections[action.section],
        },
      };
    case "clearRepo":
      return {
        ...state,
        mode: "workbench",
        selectedRepoId: null,
        selectedIssueNumber: null,
        selectedDeploymentId: null,
      };
    case "clearDeployment":
      return {
        ...state,
        selectedDeploymentId: null,
      };
  }
}

export function clampWorkbenchColumnWidths(widths: Partial<WorkbenchColumnWidths>): WorkbenchColumnWidths {
  return {
    instances: clampColumnWidth("instances", widths.instances),
    issues: clampColumnWidth("issues", widths.issues),
  };
}

export function sidePaneWidthsApply(mode: WorkbenchMode): boolean {
  return mode !== "globalIssues" && mode !== "board" && mode !== "settings";
}

export function selectedRepo(
  payload: WorkbenchPayload | null,
  state: WorkbenchSelectionState,
): WorkbenchRepo | null {
  if (!payload || state.selectedRepoId === null) return null;
  return payload.repos.find((repo) => repo.id === state.selectedRepoId) ?? null;
}

export function selectedDeployment(
  payload: WorkbenchPayload | null,
  state: WorkbenchSelectionState,
): WorkbenchDeployment | null {
  if (!payload || state.selectedDeploymentId === null) return null;
  return payload.deployments.find((deployment) => deployment.id === state.selectedDeploymentId) ?? null;
}

export function sortDeploymentSessions(
  deployments: WorkbenchDeployment[],
  previews: Record<string, WorkbenchPreview>,
  sortMode: SessionSortMode,
): WorkbenchDeployment[] {
  return [...deployments].sort((left, right) => {
    if (sortMode === "recent") {
      return compareTimestampDesc(left.launchedAt, right.launchedAt) || compareDeploymentTie(left, right);
    }

    if (sortMode === "kind") {
      return compareDeploymentTie(left, right);
    }

    return (
      previewRank(left, previews) - previewRank(right, previews)
      || compareTimestampDesc(left.launchedAt, right.launchedAt)
      || compareDeploymentTie(left, right)
    );
  });
}

export function previewForDeployment(
  deployment: WorkbenchDeployment,
  previews: Record<string, WorkbenchPreview>,
): WorkbenchPreview | null {
  if (deployment.ttydPort === null) return null;
  return previews[String(deployment.ttydPort)] ?? null;
}

export function issueQueueCounts(repo: WorkbenchRepo): Record<IssueQueueFilter, number> {
  return {
    open: repo.issues.filter((issue) => issue.state === "open").length,
    running: repo.issues.filter((issue) => issue.state === "open" && issue.hasActiveDeployment).length,
    closed: repo.issues.filter((issue) => issue.state === "closed").length,
  };
}

export function filterIssueQueue(
  issues: WorkbenchIssueSummary[],
  filter: IssueQueueFilter,
): WorkbenchIssueSummary[] {
  return issues.filter((issue) => {
    if (filter === "closed") return issue.state === "closed";
    if (filter === "running") return issue.state === "open" && issue.hasActiveDeployment;
    return issue.state === "open";
  });
}

export function deploymentForIssue(
  repo: WorkbenchRepo,
  issueNumber: number,
): WorkbenchDeployment | null {
  return repo.deployments.find((deployment) => deployment.issueNumber === issueNumber) ?? null;
}

export function repoRailBadgeCount(repo: WorkbenchRepo): number {
  return repo.deployments.length;
}

export function compactRepoInitials(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  if (!cleaned) return "?";
  if (cleaned.length <= 3 && !cleaned.includes(" ")) {
    return cleaned.toUpperCase();
  }

  const chunks = cleaned.match(/issue|bug|drop|ctl|api|web|app|server|client|[a-zA-Z0-9]+/gi)
    ?? [cleaned];
  if (chunks.length > 1) {
    return chunks.slice(0, 2).map((chunk) => chunk[0]).join("").toUpperCase();
  }

  return cleaned.slice(0, 2).toUpperCase();
}

function previewRank(
  deployment: WorkbenchDeployment,
  previews: Record<string, WorkbenchPreview>,
): number {
  const preview = previewForDeployment(deployment, previews);
  return preview ? PREVIEW_STATUS_RANK[preview.status] : PREVIEW_STATUS_RANK.unavailable;
}

function compareTimestampDesc(left: string, right: string): number {
  return Date.parse(right) - Date.parse(left);
}

function compareDeploymentTie(left: WorkbenchDeployment, right: WorkbenchDeployment): number {
  return left.issueNumber - right.issueNumber || left.id - right.id;
}

function clampColumnWidth(column: WorkbenchColumnKey, value: number | undefined): number {
  const limits = WORKBENCH_COLUMN_WIDTH_LIMITS[column];
  if (typeof value !== "number" || !Number.isFinite(value)) return limits.default;
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)));
}
