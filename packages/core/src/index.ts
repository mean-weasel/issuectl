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
