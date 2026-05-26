const REDACTED = "[redacted]";

const SECRET_FIELD_RE = /(^|_)(secret|token|password|authorization|signature|credential|private_key|access_key)($|_)/i;
const CONTENT_FIELD_RE = /(^|_)(body|body_text|comment|comments|text)($|_)/i;
const TOKEN_VALUE_RE = /\b(gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|xox[baprs]-[A-Za-z0-9-]+)\b/g;
const ASSIGNMENT_SECRET_RE = /\b([A-Za-z0-9_.-]*(?:secret|token|password|authorization|signature)[A-Za-z0-9_.-]*)\s*[:=]\s*([^\s,;&]+)/gi;

export function redactWebhookPayload(payloadJson: string): string {
  try {
    return JSON.stringify(redactValue(JSON.parse(payloadJson), []), null, 2);
  } catch {
    return redactSecretText(payloadJson);
  }
}

function redactValue(value: unknown, path: string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, path));
  }
  if (value && typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const nextPath = [...path, key];
      redacted[key] = shouldRedactField(key, nextPath)
        ? REDACTED
        : redactValue(child, nextPath);
    }
    return redacted;
  }
  if (typeof value === "string") {
    return redactSecretText(value);
  }
  return value;
}

function shouldRedactField(key: string, path: string[]): boolean {
  if (SECRET_FIELD_RE.test(key) || CONTENT_FIELD_RE.test(key)) return true;
  const joinedPath = path.join(".");
  return /\b(issue|pull_request|discussion|review|comment)\.body$/i.test(joinedPath);
}

function redactSecretText(value: string): string {
  return value
    .replace(TOKEN_VALUE_RE, REDACTED)
    .replace(ASSIGNMENT_SECRET_RE, (_match, key: string) => `${key}=${REDACTED}`);
}
