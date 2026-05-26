import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { iosSetupCommand } from "./commands/ios.js";
import { webCommand } from "./commands/web.js";
import { registerAgentCommands } from "./commands/agent.js";
import { registerDiagCommands } from "./commands/diag.js";
import { registerWebhookCommands } from "./commands/webhook.js";
import {
  repoAddCommand,
  repoRemoveCommand,
  repoListCommand,
  repoSetCommand,
  repoUpdateCommand,
  repoShowCommand,
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

const ios = program
  .command("ios")
  .description("iOS development helpers");

ios
  .command("setup")
  .description("Print iOS setup credentials, or open the setup link in the booted simulator")
  .option("-p, --port <port>", "Port number", "3847")
  .option("--server-url <url>", "Server URL reachable from the app")
  .option("--simulator", "Open the setup deep link in the booted simulator")
  .option("--preview", "Use the preview app URL scheme when opening the simulator")
  .action(iosSetupCommand);

const repo = program
  .command("repo")
  .description("Manage tracked repositories");

repo
  .command("add <owner/repo>")
  .description("Add a repository to track")
  .option("--path <local-path>", "Local filesystem path to the repo")
  .option("--webhook", "Install GitHub webhook setup")
  .option("--no-webhook", "Skip GitHub webhook setup")
  .option("--auto-launch-issues", "Enable webhook issue auto-launch")
  .option("--no-auto-launch-issues", "Disable webhook issue auto-launch")
  .option("--auto-review-prs", "Enable PR auto-review reservation")
  .option("--no-auto-review-prs", "Disable PR auto-review reservation")
  .option("--issue-agent <agent>", "Agent for issue sessions: claude or codex")
  .option("--review-agent <agent>", "Agent for PR reviews: claude or codex")
  .option("--webhook-payload-mode <mode>", "Webhook payload storage: metadata or raw")
  .option("--webhook-base-url <url>", "Public webhook base URL")
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
  .command("show <owner/repo>")
  .description("Show tracked repository settings")
  .action(repoShowCommand);

repo
  .command("update <owner/repo>")
  .description("Update a tracked repository")
  .option("--path <local-path>", "New local filesystem path")
  .option("--auto-launch-issues", "Enable webhook issue auto-launch")
  .option("--no-auto-launch-issues", "Disable webhook issue auto-launch")
  .option("--auto-review-prs", "Enable PR auto-review reservation")
  .option("--no-auto-review-prs", "Disable PR auto-review reservation")
  .option("--issue-agent <agent>", "Agent for issue sessions: claude or codex")
  .option("--review-agent <agent>", "Agent for PR reviews: claude or codex")
  .option("--webhook-payload-mode <mode>", "Webhook payload storage: metadata or raw")
  .option("--webhook-base-url <url>", "Public webhook base URL")
  .action(repoUpdateCommand);

repo
  .command("set <owner/repo>")
  .description("Set tracked repository automation settings")
  .option("--auto-launch-issues <enabled>", "Enable or disable webhook issue auto-launch: true or false")
  .option("--auto-review-prs <enabled>", "Enable or disable PR auto-review: true or false")
  .option("--issue-agent <agent>", "Agent for issue sessions: claude or codex")
  .option("--review-agent <agent>", "Agent for PR reviews: claude or codex")
  .option("--webhook-payload-mode <mode>", "Webhook payload storage: metadata or raw")
  .option("--webhook-base-url <url>", "Public webhook base URL")
  .action(repoSetCommand);

// Owner-decision/deferred CLI scope: `issue create --auto-launch` and
// `pr create --auto-review` need dedicated GitHub issue/PR command modules.
registerDiagCommands(program);
registerWebhookCommands(program);
registerAgentCommands(program);

program.parse();
