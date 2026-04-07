import { confirm, input } from "@inquirer/prompts";
import { dbExists, getDb, closeDb, seedDefaults, addRepo } from "@issuectl/core";
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

  const db = getDb();
  seedDefaults(db);
  log.success("Database created and defaults seeded.");

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
