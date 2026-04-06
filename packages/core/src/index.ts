export type { Repo, Setting, SettingKey, Deployment, CacheEntry } from "./types.js";

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
} from "./db/deployments.js";
export {
  getCached,
  setCached,
  isFresh,
  clearCache,
} from "./db/cache.js";

// GitHub client
export type {
  GitHubUser,
  GitHubIssue,
  GitHubPull,
  GitHubComment,
  GitHubLabel,
  GitHubCheck,
} from "./github/types.js";
export { getGhToken, checkGhAuth } from "./github/auth.js";
export { getOctokit } from "./github/client.js";
export {
  listIssues,
  getIssue,
  createIssue,
  updateIssue,
  closeIssue,
  getComments,
  addComment,
} from "./github/issues.js";
export {
  listPulls,
  getPull,
  getPullChecks,
  findLinkedPRs,
} from "./github/pulls.js";
export {
  LIFECYCLE_LABEL,
  listLabels,
  ensureLifecycleLabels,
  addLabel,
  removeLabel,
} from "./github/labels.js";
