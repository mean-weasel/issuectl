import { existsSync } from "node:fs";
import { confirm, input } from "@inquirer/prompts";
import { addRepo, removeRepo, listRepos, getRepo, updateRepo } from "@issuectl/core";
import * as log from "../utils/logger.js";
import { requireDb } from "../utils/db.js";
import { isValidOwnerRepo, parseOwnerRepo } from "../utils/validation.js";

function requireValidOwnerRepo(value: string): { owner: string; name: string } {
  if (!isValidOwnerRepo(value)) {
    log.error("Invalid format. Use: owner/name (e.g., mean-weasel/seatify)");
    process.exit(1);
  }
  return parseOwnerRepo(value);
}

export async function repoAddCommand(
  ownerRepo: string,
  options: { path?: string },
): Promise<void> {
  const { owner, name } = requireValidOwnerRepo(ownerRepo);
  const db = requireDb();

  const existing = getRepo(db, owner, name);
  if (existing) {
    log.warn(`${owner}/${name} is already tracked.`);
    return;
  }

  let localPath = options.path;
  if (!localPath) {
    localPath = await input({
      message: "Local path (optional, press Enter to skip):",
      default: "",
    });
  }

  if (localPath && !existsSync(localPath)) {
    log.warn(`Path "${localPath}" does not exist. Saving anyway.`);
  }

  const repo = addRepo(db, {
    owner,
    name,
    localPath: localPath || undefined,
  });
  log.success(`Added ${repo.owner}/${repo.name}`);
}

export async function repoRemoveCommand(ownerRepo: string): Promise<void> {
  const { owner, name } = requireValidOwnerRepo(ownerRepo);
  const db = requireDb();
  const repo = getRepo(db, owner, name);

  if (!repo) {
    log.error(`${owner}/${name} is not tracked.`);
    process.exit(1);
  }

  const ok = await confirm({
    message: `Remove ${owner}/${name}?`,
    default: false,
  });

  if (!ok) {
    log.info("Cancelled.");
    return;
  }

  removeRepo(db, repo.id);
  log.success(`Removed ${owner}/${name}`);
}

export function repoListCommand(): void {
  const db = requireDb();
  const repos = listRepos(db);

  if (repos.length === 0) {
    log.info("No repositories tracked. Run `issuectl repo add` to add one.");
    return;
  }

  console.error("");
  for (const repo of repos) {
    const path = repo.localPath ?? "(no local path)";
    const pattern = repo.branchPattern ?? "(default)";
    console.error(`  ${repo.owner}/${repo.name}`);
    console.error(`    Path:    ${path}`);
    console.error(`    Pattern: ${pattern}`);
    console.error("");
  }
}

export async function repoUpdateCommand(
  ownerRepo: string,
  options: { path?: string },
): Promise<void> {
  const { owner, name } = requireValidOwnerRepo(ownerRepo);
  const db = requireDb();
  const repo = getRepo(db, owner, name);

  if (!repo) {
    log.error(`${owner}/${name} is not tracked.`);
    process.exit(1);
  }

  if (options.path) {
    if (!existsSync(options.path)) {
      log.warn(`Path "${options.path}" does not exist. Saving anyway.`);
    }
    updateRepo(db, repo.id, { localPath: options.path });
    log.success(`Updated ${owner}/${name} path to ${options.path}`);
  } else {
    log.warn("No updates specified. Use --path to update the local path.");
  }
}
