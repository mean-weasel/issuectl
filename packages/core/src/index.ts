export type { Repo, Setting, SettingKey, Deployment, CacheEntry, ClaudeAlias } from "./types.js";

export { getDb, getDbPath, dbExists, closeDb } from "./db/connection.js";
export { initSchema, getSchemaVersion } from "./db/schema.js";
export { runMigrations } from "./db/migrations.js";
export {
  addRepo,
  removeRepo,
  getRepo,
  getRepoById,
  listRepos,
  updateRepo,
} from "./db/repos.js";
export {
  getSetting,
  setSetting,
  getSettings,
  seedDefaults,
} from "./db/settings.js";
export {
  recordDeployment,
  getDeploymentById,
  getDeploymentsForIssue,
  getDeploymentsByRepo,
  updateLinkedPR,
  endDeployment,
} from "./db/deployments.js";
export {
  getCacheTtl,
  getCached,
  setCached,
  isFresh,
  clearCacheKey,
  clearCache,
} from "./db/cache.js";
export {
  listAliases,
  getDefaultAlias,
  addAlias,
  removeAlias,
  setDefaultAlias,
  clearDefaultAlias,
} from "./db/aliases.js";

// GitHub client
export type {
  GitHubUser,
  GitHubIssue,
  GitHubPull,
  GitHubComment,
  GitHubLabel,
  GitHubCheck,
  GitHubPullFile,
} from "./github/types.js";
export { getGhToken, checkGhAuth } from "./github/auth.js";
export { getOctokit, resetOctokit } from "./github/client.js";
export {
  createIssue,
  updateIssue,
  closeIssue,
} from "./github/issues.js";
export {
  LIFECYCLE_LABEL,
  listLabels,
  ensureLifecycleLabels,
  addLabel,
  removeLabel,
} from "./github/labels.js";

// Cached data layer (SWR)
export {
  getIssues,
  getIssueDetail,
} from "./data/issues.js";
export {
  getPulls,
  getPullDetail,
} from "./data/pulls.js";
export { getDashboardData } from "./data/repos.js";
export {
  getComments,
  addComment,
} from "./data/comments.js";

// Launch flow
export {
  executeLaunch,
  type LaunchOptions,
  type LaunchResult,
  type LaunchContext,
  type WorkspaceMode,
  type WorkspaceResult,
  generateBranchName,
} from "./launch/launch.js";
export {
  branchExists,
  createOrCheckoutBranch,
  isWorkingTreeClean,
  getDefaultBranch,
} from "./launch/branch.js";
export {
  assembleContext,
  writeContextFile,
} from "./launch/context.js";
export { prepareWorkspace } from "./launch/workspace.js";
export {
  getTerminalLauncher,
  type TerminalLauncher,
  type TerminalLaunchOptions,
  type TerminalSettings,
  type SupportedTerminal,
} from "./launch/terminal.js";

// Lifecycle label reconciliation
export { matchLinkedPRs } from "./lifecycle/detect.js";
export {
  reconcileIssueLifecycle,
  reconcileRepoLifecycle,
  type ReconcileResult,
  type LinkedPRState,
} from "./lifecycle/reconcile.js";
