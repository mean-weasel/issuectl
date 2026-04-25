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

/** Reset cached state — test-only. */
export function resetForTesting(): void {
  publicIp = null;
  lanIp = null;
}
