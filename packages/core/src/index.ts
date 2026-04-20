export type {
  Repo,
  Setting,
  SettingKey,
  Deployment,
  DeploymentState,
  CacheEntry,
  Draft,
  DraftInput,
  Priority,
  IssuePriority,
  Section,
  SortMode,
  UnifiedListItem,
  DraftListItem,
  IssueListItem,
  UnifiedList,
} from "./types.js";
export { SORT_MODES } from "./types.js";

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
  listCachedAccessibleRepos,
  getAccessibleReposSyncedAt,
  replaceAccessibleRepos,
} from "./db/github-repos.js";
export {
  getSetting,
  setSetting,
  getSettings,
  seedDefaults,
} from "./db/settings.js";
export {
  createDraft,
  listDrafts,
  getDraft,
  updateDraft,
  deleteDraft,
  assignDraftToRepo,
  DraftPartialCommitError,
  type DraftUpdate,
  type AssignDraftResult,
} from "./db/drafts.js";
export {
  setPriority,
  getPriority,
  deletePriority,
  listPrioritiesForRepo,
} from "./db/priority.js";
export {
  recordDeployment,
  getDeploymentById,
  getDeploymentsForIssue,
  getDeploymentsByRepo,
  hasLiveDeploymentForIssue,
  updateLinkedPR,
  endDeployment,
  activateDeployment,
  deletePendingDeployment,
  cleanupOrphanedDeployments,
  pruneEndedDeployments,
} from "./db/deployments.js";
export {
  getCacheTtl,
  getCached,
  setCached,
  isFresh,
  clearCacheKey,
  clearCache,
  pruneStaleCache,
  getOldestCacheAge,
} from "./db/cache.js";
export {
  withIdempotency,
  pruneExpiredNonces,
  isValidNonce,
  DuplicateInFlightError,
} from "./db/idempotency.js";
// GitHub client
export type {
  GitHubUser,
  GitHubIssue,
  GitHubPull,
  GitHubComment,
  GitHubLabel,
  GitHubCheck,
  GitHubPullFile,
  GitHubAccessibleRepo,
} from "./github/types.js";
export { getGhToken, checkGhAuth } from "./github/auth.js";
export { getOctokit, resetOctokit, withAuthRetry } from "./github/client.js";
export {
  classifyGitHubError,
  formatErrorForUser,
  type ClassifiedError,
  type GitHubErrorKind,
} from "./github/errors.js";
export {
  createIssue,
  updateIssue,
  closeIssue,
  reassignIssue,
  type ReassignResult,
} from "./github/issues.js";
export {
  LIFECYCLE_LABEL,
  listLabels,
  ensureLifecycleLabels,
  addLabel,
  addLabels,
  removeLabel,
} from "./github/labels.js";
export { listAccessibleRepos } from "./github/repos.js";

// Cached data layer (SWR)
export {
  getIssues,
  getIssueDetail,
  getIssueHeader,
  getIssueContent,
} from "./data/issues.js";
export {
  getPulls,
  getPullDetail,
} from "./data/pulls.js";
export { getDashboardData } from "./data/repos.js";
export {
  readCachedAccessibleRepos,
  refreshAccessibleRepos,
  ACCESSIBLE_REPOS_TTL_SECONDS,
  type AccessibleReposSnapshot,
} from "./data/github-repos.js";
export {
  getComments,
  addComment,
} from "./data/comments.js";
export {
  getUnifiedList,
  groupIntoSections,
  type PerRepoData,
  type GroupIntoSectionsInput,
} from "./data/unified-list.js";

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
  cleanupStaleContextFiles,
} from "./launch/context.js";
export { prepareWorkspace } from "./launch/workspace.js";
export {
  verifyTtyd,
  spawnTtyd,
  killTtyd,
  isTtydAlive,
  allocatePort,
  reconcileOrphanedDeployments,
  type SpawnTtydOptions,
} from "./launch/ttyd.js";
export { updateTtydInfo } from "./db/deployments.js";
export {
  validateClaudeArgs,
  KNOWN_CLAUDE_FLAGS,
  type ValidationResult,
} from "./launch/claude-args.js";

// Lifecycle label reconciliation
export { mapLimit, DEFAULT_REPO_FANOUT } from "./data/map-limit.js";

export { matchLinkedPRs } from "./lifecycle/detect.js";
export {
  reconcileIssueLifecycle,
  reconcileRepoLifecycle,
  type ReconcileResult,
  type LinkedPRState,
} from "./lifecycle/reconcile.js";

// Parse flow (NL → structured issues)
export type {
  ParsedIssue,
  ParsedIssueType,
  ParsedIssueClarity,
  ParsedIssuesResponse,
  ReviewedIssue,
  BatchCreateResult,
} from "./parse/index.js";
export {
  PARSED_ISSUES_SCHEMA,
  parseIssues,
  checkClaudeCliAvailable,
  formatRepoContext,
  type RepoWithLabels,
} from "./parse/index.js";
