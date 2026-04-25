import { confirm, input } from "@inquirer/prompts";
import { dbExists, getDb, closeDb, seedDefaults, addRepo, generateApiToken } from "@issuectl/core";
import * as log from "../utils/logger.js";
import { requireAuth } from "../utils/auth.js";
import { validateOwnerRepo, parseOwnerRepo } from "../utils/validation.js";

export async function initCommand(): Promise<void> {
  log.banner();
  console.error("First-time setup\n");

  const { username } = await requireAuth();
  log.success(`Authenticated as ${username} via gh`);

  if (dbExists()) {
    const reinit = await confirm({
      message: "Database already exists. Re-initialize?",
      default: false,
    });
    if (!reinit) {
      log.info("Keeping existing database.");
      return;
    }
    // Reset the singleton so getDb() creates a fresh connection
    closeDb();
  }

  let db;
  try {
    db = getDb();
    seedDefaults(db);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Failed to initialize database: ${message}`);
    log.info("Check that ~/.issuectl/ is writable and has sufficient disk space.");
    process.exit(1);
  }
  log.success("Database created and defaults seeded.");

  const token = generateApiToken(db);
  log.success("API token generated for mobile access.");
  log.info(`Token: ${token}`);
  log.info("Use this token in the iOS app to connect to this server.");

  const addFirst = await confirm({
    message: "Add your first repository?",
    default: true,
  });

  if (addFirst) {
    const ownerRepo = await input({
      message: "Repository (owner/name):",
      validate: validateOwnerRepo,
    });

    const { owner, name } = parseOwnerRepo(ownerRepo);

    const localPath = await input({
      message: "Local path (optional, press Enter to skip):",
      default: `~/Desktop/${name}`,
    });

    const repo = addRepo(db, {
      owner,
      name,
      localPath: localPath || undefined,
    });

    log.success(`Added ${repo.owner}/${repo.name}`);
    if (repo.localPath) {
      log.info(`Local path: ${repo.localPath}`);
    }
  }

  console.error("");
  log.success("Setup complete. Run `issuectl web` to start the dashboard.");
}
