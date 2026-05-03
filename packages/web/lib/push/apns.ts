import { createPrivateKey, sign } from "node:crypto";
import { connect } from "node:http2";
import type { PushDevice } from "@issuectl/core";

export type ApnsPayload = {
  aps: {
    alert: {
      title: string;
      body: string;
    };
    sound?: string;
  };
  type: string;
  url?: string;
  [key: string]: unknown;
};

export type ApnsSendResult =
  | { status: "sent"; token: string }
  | { status: "skipped"; token: string; reason: string }
  | { status: "failed"; token: string; reason: string; statusCode?: number };

type ApnsConfig = {
  teamId: string;
  keyId: string;
  bundleId: string;
  privateKey: string;
};

const APNS_TIMEOUT_MS = 10_000;

function readConfig(): ApnsConfig | undefined {
  const teamId = process.env.ISSUECTL_APNS_TEAM_ID;
  const keyId = process.env.ISSUECTL_APNS_KEY_ID;
  const bundleId = process.env.ISSUECTL_APNS_BUNDLE_ID;
  const privateKey = process.env.ISSUECTL_APNS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!teamId || !keyId || !bundleId || !privateKey) return undefined;
  return { teamId, keyId, bundleId, privateKey };
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createJwt(config: ApnsConfig): string {
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64Url(JSON.stringify({
    iss: config.teamId,
    iat: Math.floor(Date.now() / 1000),
  }));
  const signingInput = `${header}.${claims}`;
  const signature = sign(
    "sha256",
    Buffer.from(signingInput),
    {
      key: createPrivateKey(config.privateKey),
      dsaEncoding: "ieee-p1363",
    },
  );
  return `${signingInput}.${base64Url(signature)}`;
}

export async function sendApnsNotification(
  device: PushDevice,
  payload: ApnsPayload,
): Promise<ApnsSendResult> {
  const config = readConfig();
  if (!config) {
    return {
      status: "skipped",
      token: device.token,
      reason: "APNs credentials are not configured",
    };
  }

  let jwt: string;
  try {
    jwt = createJwt(config);
  } catch (err) {
    return {
      status: "failed",
      token: device.token,
      reason: err instanceof Error ? err.message : "Failed to create APNs JWT",
    };
  }

  const host = device.environment === "development"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";
  const client = connect(host);

  return await new Promise<ApnsSendResult>((resolve) => {
    let settled = false;
    const finish = (result: ApnsSendResult) => {
      if (settled) return;
      settled = true;
      client.close();
      resolve(result);
    };

    client.on("error", (err) => {
      finish({ status: "failed", token: device.token, reason: err.message });
    });

    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${device.token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let responseBody = "";
    let statusCode = 0;

    request.setEncoding("utf8");
    request.on("response", (headers) => {
      statusCode = Number(headers[":status"] ?? 0);
    });
    request.on("data", (chunk) => {
      responseBody += chunk;
    });
    request.on("end", () => {
      if (statusCode >= 200 && statusCode < 300) {
        finish({ status: "sent", token: device.token });
        return;
      }
      finish({
        status: "failed",
        token: device.token,
        statusCode,
        reason: responseBody || `APNs returned ${statusCode}`,
      });
    });
    request.on("error", (err) => {
      finish({ status: "failed", token: device.token, reason: err.message });
    });
    request.setTimeout(APNS_TIMEOUT_MS, () => {
      request.close();
      finish({
        status: "failed",
        token: device.token,
        reason: `APNs request timed out after ${APNS_TIMEOUT_MS}ms`,
      });
    });

    request.end(JSON.stringify(payload));
  });
}
