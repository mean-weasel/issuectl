import os from "node:os";

export function detectLanIp(): string | null {
  for (const addrs of Object.values(os.networkInterfaces())) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal && !addr.address.startsWith("169.254.")) {
        return addr.address;
      }
    }
  }
  return null;
}

export function buildIosSetupUrl(
  serverUrl: string,
  token: string,
  scheme = "issuectl",
): string {
  const params = new URLSearchParams({
    serverURL: serverUrl,
    token,
  });
  return `${scheme}://setup?${params.toString()}`;
}
