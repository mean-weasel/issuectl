/**
 * Classify errors thrown by Octokit (or our own network/subprocess layer) into
 * a small, stable set of user-actionable kinds. Action handlers route caught
 * errors through `classifyGitHubError` and surface `.message` to the UI.
 *
 * Kinds are deliberately coarse — we only need enough resolution to give the
 * user a recovery hint (refresh auth, wait for rate limit, retry, etc.).
 */
export type GitHubErrorKind =
  | "rate_limited"
  | "auth_expired"
  | "forbidden"
  | "not_found"
  | "validation"
  | "network"
  | "timeout"
  | "unknown";

export type ClassifiedError = {
  kind: GitHubErrorKind;
  /** User-facing, actionable message. Safe to surface verbatim to the UI. */
  message: string;
  /** HTTP status if the error came from an API response. */
  status?: number;
  /** Seconds to wait before retrying. Only set for rate_limited. */
  retryAfterSec?: number;
  cause: unknown;
};

type MaybeResponseLike = {
  status?: number;
  message?: string;
  response?: { headers?: Record<string, string | number | undefined> };
};

function hasStatus(err: unknown): err is MaybeResponseLike {
  return (
    typeof err === "object" &&
    err !== null &&
    ("status" in err || "response" in err)
  );
}

function getHeader(
  err: MaybeResponseLike,
  name: string,
): string | undefined {
  const headers = err.response?.headers;
  if (!headers) return undefined;
  const raw = headers[name] ?? headers[name.toLowerCase()];
  return raw === undefined ? undefined : String(raw);
}

function parseRetryAfter(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseRateLimitReset(
  value: string | undefined,
): number | undefined {
  if (!value) return undefined;
  const reset = Number(value);
  if (!Number.isFinite(reset)) return undefined;
  const delta = reset - Math.floor(Date.now() / 1000);
  return delta > 0 ? delta : 0;
}

export function classifyGitHubError(err: unknown): ClassifiedError {
  if (hasStatus(err)) {
    const status = err.status;
    const origMessage = err.message ?? "";

    if (status === 401) {
      return {
        kind: "auth_expired",
        message:
          "GitHub authentication expired. Run `gh auth refresh` and try again.",
        status,
        cause: err,
      };
    }

    if (status === 429) {
      const retryAfterSec = parseRetryAfter(getHeader(err, "retry-after"));
      return {
        kind: "rate_limited",
        message:
          retryAfterSec !== undefined
            ? `GitHub rate limit reached. Retry in ${retryAfterSec}s.`
            : "GitHub rate limit reached. Please wait and retry.",
        status,
        retryAfterSec,
        cause: err,
      };
    }

    if (status === 403) {
      const remaining = getHeader(err, "x-ratelimit-remaining");
      if (remaining === "0") {
        const retryAfterSec = parseRateLimitReset(
          getHeader(err, "x-ratelimit-reset"),
        );
        return {
          kind: "rate_limited",
          message:
            retryAfterSec !== undefined
              ? `GitHub rate limit reached. Retry in ${retryAfterSec}s.`
              : "GitHub rate limit reached. Please wait and retry.",
          status,
          retryAfterSec,
          cause: err,
        };
      }
      return {
        kind: "forbidden",
        message: origMessage
          ? `GitHub denied the request: ${origMessage}`
          : "GitHub denied the request. Check your permissions on this repository.",
        status,
        cause: err,
      };
    }

    if (status === 404) {
      return {
        kind: "not_found",
        message: "Not found on GitHub. The resource may have been deleted or renamed.",
        status,
        cause: err,
      };
    }

    if (status === 422) {
      return {
        kind: "validation",
        message: origMessage
          ? `GitHub rejected the request: ${origMessage}`
          : "GitHub rejected the request as invalid.",
        status,
        cause: err,
      };
    }

    if (typeof status === "number" && status >= 500) {
      return {
        kind: "unknown",
        message: `GitHub server error (${status}). Try again shortly.`,
        status,
        cause: err,
      };
    }
  }

  // Node network-layer errors (Octokit re-throws these as-is on connection
  // failures, and our own subprocess code uses the same `code` convention).
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (
      code === "ECONNREFUSED" ||
      code === "ETIMEDOUT" ||
      code === "ENOTFOUND" ||
      code === "EAI_AGAIN" ||
      code === "ECONNRESET"
    ) {
      return {
        kind: "network",
        message:
          "Network error contacting GitHub. Check your connection and try again.",
        cause: err,
      };
    }
  }

  // AbortController / AbortSignal timeouts surface as AbortError.
  if (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name?: unknown }).name === "AbortError"
  ) {
    return {
      kind: "timeout",
      message: "The request timed out. Try again.",
      cause: err,
    };
  }

  const message =
    err instanceof Error && err.message ? err.message : "Unexpected error.";
  return { kind: "unknown", message, cause: err };
}

/**
 * Shorthand: classify and return the user-facing message.
 * Intended for use in server action catch blocks:
 *
 *   catch (err) {
 *     return { success: false, error: formatErrorForUser(err) };
 *   }
 */
export function formatErrorForUser(err: unknown): string {
  return classifyGitHubError(err).message;
}
