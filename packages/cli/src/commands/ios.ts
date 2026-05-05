import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { generateApiToken } from "@issuectl/core";
import { requireDb } from "../utils/db.js";
import * as log from "../utils/logger.js";
import { buildIosSetupUrl, detectLanIp } from "../utils/mobile-setup.js";

const execFileAsync = promisify(execFile);

type IosSetupOptions = {
  port: string;
  serverUrl?: string;
  simulator?: boolean;
  preview?: boolean;
};

function normalizeServerUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveServerUrl(options: IosSetupOptions): string | null {
  if (options.serverUrl) {
    return normalizeServerUrl(options.serverUrl);
  }

  const lanIp = detectLanIp();
  if (!lanIp) {
    return null;
  }

  return `http://${lanIp}:${options.port}`;
}

export async function iosSetupCommand(options: IosSetupOptions): Promise<void> {
  const db = requireDb();
  const token = generateApiToken(db);
  const serverUrl = resolveServerUrl(options);

  if (!serverUrl) {
    log.warn("Could not detect a LAN IP. Pass --server-url with the URL your device can reach.");
    log.info(`iOS API token: ${token}`);
    process.exit(options.simulator ? 1 : 0);
  }

  const appSetupUrl = buildIosSetupUrl(serverUrl, token);
  const previewSetupUrl = buildIosSetupUrl(serverUrl, token, "issuectl-preview");
  const setupUrl = options.preview ? previewSetupUrl : appSetupUrl;

  log.info(`iOS server URL: ${serverUrl}`);
  log.info(`iOS API token: ${token}`);
  log.info(`iOS setup link: ${appSetupUrl}`);
  log.info(`iOS preview setup link: ${previewSetupUrl}`);
  log.info(`iOS setup page: ${serverUrl}/setup/ios`);

  if (!options.simulator) {
    return;
  }

  try {
    await execFileAsync("xcrun", ["simctl", "openurl", "booted", setupUrl]);
    log.success(`Opened ${options.preview ? "preview" : "app"} setup link in the booted simulator.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Could not open setup link in the booted simulator: ${message}`);
    process.exit(1);
  }
}
