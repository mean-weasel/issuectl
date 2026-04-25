import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import pino from "pino";
import { createStream } from "rotating-file-stream";

const LOG_DIR = join(homedir(), ".issuectl", "logs");
const LOG_FILE = "web.log";

mkdirSync(LOG_DIR, { recursive: true });

const fileStream = createStream(LOG_FILE, {
  path: LOG_DIR,
  size: "10M",
  maxFiles: 1,
});

const log = pino(
  { level: "debug" },
  pino.multistream([
    { level: "debug", stream: process.stdout },
    { level: "debug", stream: fileStream },
  ]),
);

export default log;

/** Full path to the active log file, for display in startup banner. */
export const logPath = join(LOG_DIR, LOG_FILE);
