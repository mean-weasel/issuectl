import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type TimedExecOptions = {
  cwd?: string;
  /** Timeout in milliseconds. Required — no unbounded subprocess calls. */
  timeoutMs: number;
  /**
   * Short human-readable name for the step being run (e.g. "git fetch",
   * "ghostty open"). Included in the thrown error so the user sees *what*
   * timed out, not just a generic timeout.
   */
  step: string;
};

/**
 * Thrown when a subprocess exceeds its timeout budget. Carries the step name
 * so the classifier (and error messages) can pinpoint which git/ghostty call
 * hung instead of saying "Launch failed."
 */
export class SubprocessTimeoutError extends Error {
  readonly code = "ETIMEDOUT" as const;
  readonly step: string;
  readonly timeoutMs: number;
  constructor(step: string, timeoutMs: number, cause?: unknown) {
    super(`${step} timed out after ${timeoutMs / 1000}s`);
    this.name = "SubprocessTimeoutError";
    this.step = step;
    this.timeoutMs = timeoutMs;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

/**
 * Wrapper around `execFile` with a mandatory timeout. Node's native `timeout`
 * option sends SIGTERM and rejects with `killed: true`; we normalise that to
 * a `SubprocessTimeoutError` so callers can distinguish a timed-out `git
 * fetch` from a `git fetch` that legitimately failed with non-zero exit.
 */
export async function timedExec(
  file: string,
  args: readonly string[],
  options: TimedExecOptions,
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(file, args as string[], {
      cwd: options.cwd,
      timeout: options.timeoutMs,
    });
    return result;
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "killed" in err &&
      (err as { killed?: boolean }).killed === true
    ) {
      throw new SubprocessTimeoutError(options.step, options.timeoutMs, err);
    }
    throw err;
  }
}
