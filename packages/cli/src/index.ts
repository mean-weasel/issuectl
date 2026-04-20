import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { webCommand } from "./commands/web.js";
import {
  repoAddCommand,
  repoRemoveCommand,
  repoListCommand,
  repoUpdateCommand,
} from "./commands/repo.js";

declare const __APP_VERSION__: string;

const program = new Command();

program
  .name("issuectl")
  .description("Cross-repo GitHub issue command center")
  .version(__APP_VERSION__);

program
  .command("init")
  .description("First-time setup — create database and configure")
  .action(initCommand);

program
  .command("web")
  .description("Start the web dashboard")
  .option("-p, --port <port>", "Port number", "3847")
  .action(webCommand);

const repo = program
  .command("repo")
  .description("Manage tracked repositories");

repo
  .command("add <owner/repo>")
  .description("Add a repository to track")
  .option("--path <local-path>", "Local filesystem path to the repo")
  .action(repoAddCommand);

repo
  .command("remove <owner/repo>")
  .description("Remove a tracked repository")
  .action(repoRemoveCommand);

repo
  .command("list")
  .description("List all tracked repositories")
  .action(repoListCommand);

repo
  .command("update <owner/repo>")
  .description("Update a tracked repository")
  .option("--path <local-path>", "New local filesystem path")
  .action(repoUpdateCommand);

program.parse();
