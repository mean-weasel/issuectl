import type {
  ActiveDeploymentWithRepo,
  Deployment,
  IssuePriority,
  LaunchAgent,
  Priority,
  SettingKey,
} from "@issuectl/core";
import type { SessionPreview } from "@/lib/session-previews";

export type WorkbenchSettingsKey = Exclude<SettingKey, "api_token">;

export type WorkbenchSettings = Partial<Record<WorkbenchSettingsKey, string>>;

export type WorkbenchHealth = {
  ok: boolean;
  version: string | null;
  timestamp: string | null;
  error: string | null;
};

export type WorkbenchUser = {
  login: string | null;
  error: string | null;
};

export type WorkbenchPreview = SessionPreview;

export type TerminalBackend = "ttyd" | "pty_bridge";

export type WorkbenchDeployment =
  | (Deployment & { owner: string; repoName: string; terminalBackend?: TerminalBackend })
  | (ActiveDeploymentWithRepo & { terminalBackend?: TerminalBackend });

export type WorkbenchIssueSummary = {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: string[];
  updatedAt: string;
  priority: Priority;
  hasActiveDeployment: boolean;
  htmlUrl: string;
  authorLogin: string | null;
};

export type WorkbenchRepo = {
  id: number;
  owner: string;
  name: string;
  localPath: string | null;
  branchPattern: string | null;
  badgeCount: number;
  deployedCount: number;
  launchAgent: LaunchAgent | null;
  issueError: string | null;
  issuesFromCache: boolean;
  issuesCachedAt: string | null;
  priorities: IssuePriority[];
  deployments: WorkbenchDeployment[];
  previews: Record<string, WorkbenchPreview>;
  issues: WorkbenchIssueSummary[];
};

export type WorkbenchPayload = {
  repos: WorkbenchRepo[];
  deployments: WorkbenchDeployment[];
  previews: Record<string, WorkbenchPreview>;
  settings: WorkbenchSettings;
  health: WorkbenchHealth;
  user: WorkbenchUser;
  generatedAt: string;
};
