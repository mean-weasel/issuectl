import { accessSync, chmodSync, constants } from "node:fs";
import { createRequire } from "node:module";
import { arch as osArch, platform as osPlatform } from "node:os";
import { dirname, join } from "node:path";
import log from "./logger";

const require = createRequire(import.meta.url);
const checkedSpawnHelpers = new Set<string>();

export function ensureNodePtySpawnHelperExecutable(options: {
  helperPath?: string | null;
  platform?: string;
  arch?: string;
  resolveNodePty?: () => string;
  access?: typeof accessSync;
  chmod?: typeof chmodSync;
  resetCache?: boolean;
} = {}): boolean {
  const helperPath = options.helperPath ?? nodePtySpawnHelperPath(
    options.platform ?? osPlatform(),
    options.arch ?? osArch(),
    options.resolveNodePty ?? (() => require.resolve("node-pty")),
  );
  if (!helperPath) return false;
  if (options.resetCache) checkedSpawnHelpers.delete(helperPath);
  if (checkedSpawnHelpers.has(helperPath)) return false;

  const access = options.access ?? accessSync;
  const chmod = options.chmod ?? chmodSync;
  try {
    access(helperPath, constants.X_OK);
    checkedSpawnHelpers.add(helperPath);
    return false;
  } catch {
    chmod(helperPath, 0o755);
    access(helperPath, constants.X_OK);
    checkedSpawnHelpers.add(helperPath);
    log.warn({ msg: "node_pty_spawn_helper_chmod", helperPath });
    return true;
  }
}

function nodePtySpawnHelperPath(
  platformName: string,
  archName: string,
  resolveNodePty: () => string,
): string | null {
  if (platformName !== "darwin") return null;
  if (archName !== "arm64" && archName !== "x64") return null;
  const nodePtyEntry = resolveNodePty();
  const packageRoot = dirname(dirname(nodePtyEntry));
  return join(packageRoot, "prebuilds", `darwin-${archName}`, "spawn-helper");
}
