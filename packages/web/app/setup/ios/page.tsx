import os from "node:os";
import QRCode from "qrcode";
import { getDb, getSetting, dbExists } from "@issuectl/core";
import { getLanIp } from "@/lib/network-info";
import { CopyButton } from "./CopyButton";
import { QrImage } from "./QrImage";
import type { Metadata } from "next";
import styles from "./page.module.css";

function detectLanIp(): string | null {
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

export const metadata: Metadata = { title: "iOS Setup — issuectl" };
export const dynamic = "force-dynamic";

export default async function IosSetupPage() {
  if (!dbExists()) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>issuectl</h1>
        <p className={styles.subtitle}>
          Run <code>issuectl init</code> on your Mac first.
        </p>
      </div>
    );
  }

  const db = getDb();
  const token = getSetting(db, "api_token") ?? "";
  const lanIp = getLanIp() ?? detectLanIp();
  const port = process.env.PORT ?? "3847";
  const serverUrl = lanIp ? `http://${lanIp}:${port}` : "";

  if (!token || !serverUrl) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>issuectl</h1>
        <p className={styles.subtitle}>
          {!token
            ? "No API token found. Run issuectl init to generate one."
            : "Could not detect your Mac's LAN IP. Make sure Wi-Fi is connected."}
        </p>
      </div>
    );
  }

  const setupUrl = `issuectl://setup?serverURL=${encodeURIComponent(serverUrl)}&token=${encodeURIComponent(token)}`;
  const qrDataUrl = await QRCode.toDataURL(setupUrl, {
    margin: 2,
    width: 240,
    color: { dark: "#1a1712", light: "#f3ecd9" },
  });

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Connect to issuectl</h1>
        <p className={styles.subtitle}>
          Scan this QR code with your iPhone camera.
        </p>

        <QrImage dataUrl={qrDataUrl} alt="Scan to configure the IssueCTL iOS app" />

        <a href={setupUrl} className={styles.connectButton}>
          Open IssueCTL
        </a>

        <div className={styles.divider}>
          <span>or enter manually</span>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Server URL</label>
          <div className={styles.valueRow}>
            <code className={styles.value}>{serverUrl}</code>
            <CopyButton text={serverUrl} />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>API Token</label>
          <div className={styles.valueRow}>
            <code className={styles.value}>{token}</code>
            <CopyButton text={token} />
          </div>
        </div>
      </div>

      <p className={styles.hint}>
        Your iPhone must be on the same Wi-Fi network as your Mac.
      </p>
    </div>
  );
}
