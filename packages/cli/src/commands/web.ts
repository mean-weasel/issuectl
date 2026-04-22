import { execFile, spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as log from "../utils/logger.js";
import { requireDb } from "../utils/db.js";
import { requireAuth } from "../utils/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getWebPackagePath(): string {
  // From cli/dist/ → cli/ → packages/ → packages/web/
  return resolve(__dirname, "..", "..", "web");
}

export async function webCommand(options: { port: string }): Promise<void> {
  const port = options.port;

  requireDb();
  await requireAuth();

  const webPath = getWebPackagePath();
  const serverPath = resolve(webPath, "server.ts");

  log.info(`Starting dashboard on http://localhost:${port}`);

  const child = spawn("node", ["--import", "tsx", serverPath, "--dev"], {
    cwd: webPath,
    stdio: "inherit",
    env: { ...process.env, PORT: port },
  });

  // Auto-open browser after a short delay (macOS only for v1)
  setTimeout(() => {
    execFile("open", [`http://localhost:${port}`], (err) => {
      if (err) {
        log.warn(
          `Could not auto-open browser: ${err.message}. Open http://localhost:${port} manually.`,
        );
      }
    });
  }, 2000);

  child.on("error", (err) => {
    log.error(`Failed to start Next.js: ${err.message}`);
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  process.on("SIGINT", () => {
    child.kill("SIGINT");
  });

  process.on("SIGTERM", () => {
    child.kill("SIGTERM");
  });
}
