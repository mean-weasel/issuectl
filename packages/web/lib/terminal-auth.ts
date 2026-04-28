import { createHmac, timingSafeEqual } from "node:crypto";
import {
  getActiveDeploymentByPort,
  getDb,
  getDeploymentById,
  getSetting,
} from "@issuectl/core";
import log from "./logger";

const TOKEN_TTL_MS = 10 * 60 * 1000;

type TerminalTokenPayload = {
  deploymentId: number;
  port: number;
  exp: number;
};

function base64UrlEncode(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function getTerminalSecret(): string | null {
  const db = getDb();
  return getSetting(db, "api_token") ?? null;
}

export function createTerminalToken(deploymentId: number, port: number): string | null {
  try {
    const secret = getTerminalSecret();
    if (!secret) return null;
    const payload: TerminalTokenPayload = {
      deploymentId,
      port,
      exp: Date.now() + TOKEN_TTL_MS,
    };
    const encoded = base64UrlEncode(JSON.stringify(payload));
    return `${encoded}.${sign(encoded, secret)}`;
  } catch (err) {
    log.error({ err, msg: "terminal_token_create_failed", deploymentId, port });
    return null;
  }
}

function parseToken(token: string): TerminalTokenPayload | null {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra !== undefined) return null;

  const secret = getTerminalSecret();
  if (!secret) return null;

  const expected = sign(encoded, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as Partial<TerminalTokenPayload>;
    if (
      !Number.isInteger(payload.deploymentId) ||
      !Number.isInteger(payload.port) ||
      !Number.isFinite(payload.exp)
    ) {
      return null;
    }
    return payload as TerminalTokenPayload;
  } catch {
    return null;
  }
}

export function validateTerminalToken(token: string | null | undefined, port: number): boolean {
  if (!token) return false;
  try {
    const payload = parseToken(token);
    if (!payload || payload.port !== port || payload.exp < Date.now()) {
      return false;
    }

    const db = getDb();
    const deployment = getDeploymentById(db, payload.deploymentId);
    if (!deployment || deployment.endedAt !== null || deployment.ttydPort !== port) {
      return false;
    }

    const activeByPort = getActiveDeploymentByPort(db, port);
    return activeByPort?.id === deployment.id;
  } catch (err) {
    log.error({ err, msg: "terminal_token_validate_failed", port });
    return false;
  }
}
