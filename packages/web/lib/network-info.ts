import os from "node:os";

let publicIp: string | null = null;
let lanIp: string | null = null;

export function getPublicIp(): string | null {
  return publicIp;
}

export function getLanIp(): string | null {
  return lanIp;
}

/** Detect the first non-internal IPv4 address. */
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
    if (!res.ok) return null;
    const text = await res.text();
    return text.trim() || null;
  } catch {
    return null;
  }
}

export async function refreshNetworkInfo(): Promise<void> {
  lanIp = detectLanIp();
  publicIp = await detectPublicIp();
}

/**
 * Check if an incoming request should be redirected to the LAN URL.
 * Returns the redirect URL if the client is on the same network, null otherwise.
 */
const SKIP_REDIRECT_RE = /^\/((_next|api|favicon|icon|apple-touch-icon|manifest|sw|offline)\b)/;

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
}
