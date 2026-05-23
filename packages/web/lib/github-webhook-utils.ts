import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export type JsonObject = Record<string, unknown>;

export async function readRawBody(
  req: IncomingMessage,
  limitBytes: number,
): Promise<{ buffer: Buffer; tooLarge: boolean }> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > limitBytes) {
      return { buffer: Buffer.alloc(0), tooLarge: true };
    }
    chunks.push(buffer);
  }

  return { buffer: Buffer.concat(chunks), tooLarge: false };
}

export function verifySignature(
  body: Buffer,
  secret: string,
  signature: string,
): boolean {
  const prefix = "sha256=";
  if (!signature.startsWith(prefix)) return false;

  const expected = createHmac("sha256", secret).update(body).digest();
  const actualHex = signature.slice(prefix.length);
  if (!/^[a-fA-F0-9]{64}$/.test(actualHex)) return false;

  const actual = Buffer.from(actualHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function writeJson(
  res: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function getSingleHeader(
  req: IncomingMessage,
  name: string,
): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function getBoundedHeader(
  req: IncomingMessage,
  name: string,
  maxLength: number,
): string | null {
  const value = getSingleHeader(req, name);
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

export function parseJson(body: Buffer): JsonObject | null {
  try {
    return asObject(JSON.parse(body.toString("utf8")));
  } catch {
    return null;
  }
}

export function getRepositoryFullName(payload: JsonObject): string | null {
  return getStringProperty(asObject(payload.repository), "full_name");
}

export function getSenderLogin(payload: JsonObject): string | null {
  return getStringProperty(asObject(payload.sender), "login");
}

export function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

export function getStringProperty(
  object: JsonObject | null,
  key: string,
): string | null {
  const value = object?.[key];
  return typeof value === "string" ? value : null;
}

export function getNumberProperty(object: JsonObject, key: string): number | null {
  const value = object[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}
