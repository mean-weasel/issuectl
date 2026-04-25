import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import pino from "pino";
import { createStream } from "rotating-file-stream";

const LOG_DIR = join(homedir(), ".issuectl", "logs");
const LOG_FILE = "web.log";

const streams: pino.StreamEntry[] = [
  // Explicit `level` on each stream is required — pino.multistream
  // does NOT inherit the parent logger's level. Without it, debug
  // messages are silently dropped even when the logger is set to debug.
  { level: "debug", stream: process.stdout },
];

try {
  mkdirSync(LOG_DIR, { recursive: true });
  const fileStream = createStream(LOG_FILE, {
    path: LOG_DIR,
    size: "10M",
    maxFiles: 1,
  });
  fileStream.on("error", (err) => {
    console.error(`[issuectl] Log file write error: ${err.message}. Continuing with stdout only.`);
  });
  streams.push({ level: "debug", stream: fileStream });
} catch (err) {
  console.error(
    `[issuectl] Could not create log directory ${LOG_DIR}: ${(err as Error).message}. ` +
    `File logging disabled — logs will only appear on stdout.`,
  );
}

const log = pino({ level: "debug" }, pino.multistream(streams));

export default log;

/** Full path to the active log file, used in startup logs and console banner. */
export const logPath = join(LOG_DIR, LOG_FILE);
