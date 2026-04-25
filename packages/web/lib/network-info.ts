import os from "node:os";

let publicIp: string | null = null;
let lanIp: string | null = null;
let refreshing = false;

export function getPublicIp(): string | null {
  return publicIp;
}

export function getLanIp(): string | null {
  return lanIp;
}

/** Detect the first non-internal, non-link-local IPv4 address (typically a LAN address). */
function detectLanIp(): string | null {
  const interfaces = os.networkInterfaces();
  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal && !addr.address.startsWith("169.254.")) {
        return addr.address;
      }
    }
  }
  return null;
}

const IPIFY_URL = "https://api.ipify.org";
const FETCH_TIMEOUT_MS = 5_000;

async function detectPublicIp(): Promise<string | null> {
  try {
    const res = await fetch(IPIFY_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[issuectl] Public IP detection failed: ipify returned HTTP ${res.status}`);
      return null;
    }
    const text = await res.text();
    return text.trim() || null;
  } catch (err) {
    console.warn("[issuectl] Public IP detection failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function refreshNetworkInfo(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    const newLan = detectLanIp();
    const newPublic = await detectPublicIp();
    lanIp = newLan;
    publicIp = newPublic;
  } catch (err) {
    console.warn("[issuectl] Network info refresh failed:", err instanceof Error ? err.message : err);
    lanIp = null;
    publicIp = null;
  } finally {
    refreshing = false;
  }
}

// Skip static/infra routes that don't need the LAN redirect.
// Lookahead requires keyword followed by '/', '.', or end-of-path — /api/health and /favicon.ico
// are skipped, but /api-docs is not.
const SKIP_REDIRECT_RE = /^\/((_next|api|favicon|icon|apple-touch-icon|manifest|sw|offline)(?=\/|\.|$))/;

export function getLanRedirectUrl(
  clientIp: string | undefined,
  pathname: string,
  search: string,
  port: number,
): string | null {
  if (!process.env.ISSUECTL_TUNNEL_URL) return null;
  if (!clientIp) return null;
  if (!publicIp || !lanIp) return null;
  if (clientIp !== publicIp) return null;
  if (SKIP_REDIRECT_RE.test(pathname)) return null;
  return `http://${lanIp}:${port}${pathname}${search}`;
}

/** Reset cached state — test-only. */
export function resetForTesting(): void {
  publicIp = null;
  lanIp = null;
  refreshing = false;
}
