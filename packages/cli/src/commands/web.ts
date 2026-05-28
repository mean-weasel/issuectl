import { execFile, spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import qrcode from "qrcode-terminal";
import * as log from "../utils/logger.js";
import { requireDb } from "../utils/db.js";
import { requireAuth } from "../utils/auth.js";
import { buildIosSetupUrl, detectLanIp } from "../utils/mobile-setup.js";
import { generateApiToken } from "@issuectl/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getWebPackagePath(): string {
  // From cli/dist/ → cli/ → packages/ → packages/web/
  return resolve(__dirname, "..", "..", "web");
}

export function resolveIssuectlCliPath(
  env: NodeJS.ProcessEnv = process.env,
  argvEntry = process.argv[1],
): string | undefined {
  const configured = env.ISSUECTL_CLI?.trim();
  if (configured) return configured;
  const entry = argvEntry?.trim();
  return entry ? resolve(entry) : undefined;
}

export function buildWebServerEnv(
  port: string,
  env: NodeJS.ProcessEnv = process.env,
  argvEntry = process.argv[1],
): NodeJS.ProcessEnv {
  const issuectlCli = resolveIssuectlCliPath(env, argvEntry);
  return {
    ...env,
    PORT: port,
    ISSUECTL_SERVER_URL: env.ISSUECTL_SERVER_URL?.trim() || `http://localhost:${port}`,
    ...(issuectlCli ? { ISSUECTL_CLI: issuectlCli } : {}),
  };
}

export function buildWebServerArgs(webPath: string): string[] {
  return [
    "--import",
    resolve(webPath, "server-polyfills.mjs"),
    "--import",
    "tsx",
    resolve(webPath, "server.ts"),
    "--dev",
  ];
}

export async function webCommand(options: { port: string }): Promise<void> {
  const port = options.port;

  const db = requireDb();
  await requireAuth();

  const webPath = getWebPackagePath();
  const token = generateApiToken(db);
  const lanIp = detectLanIp();

  log.info(`Starting dashboard on http://localhost:${port}`);
  if (lanIp) {
    const iosServerUrl = `http://${lanIp}:${port}`;
    const setupUrl = buildIosSetupUrl(iosServerUrl, token);
    const previewSetupUrl = buildIosSetupUrl(iosServerUrl, token, "issuectl-preview");
    log.info(`iOS server URL: ${iosServerUrl}`);
    log.info(`iOS API token: ${token}`);
    log.info(`iOS setup link: ${setupUrl}`);
    log.info(`iOS preview setup link: ${previewSetupUrl}`);
    log.info(`iOS setup page: ${iosServerUrl}/setup/ios`);
    log.info("Scan this QR code with your iPhone Camera to configure the iOS app:");
    qrcode.generate(setupUrl, { small: true }, (qr) => {
      console.error(qr);
    });
  } else {
    log.warn("Could not detect a LAN IP for iOS setup. Use your Mac's Wi-Fi IP address.");
    log.info(`iOS API token: ${token}`);
  }

  const child = spawn("node", buildWebServerArgs(webPath), {
    cwd: webPath,
    stdio: "inherit",
    env: buildWebServerEnv(port),
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
