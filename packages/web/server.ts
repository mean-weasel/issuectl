import { createServer } from "node:http";
import next from "next";
import { handleUpgrade } from "./lib/terminal-proxy.js";

const TERMINAL_WS_RE = /^\/api\/terminal\/(\d+)\/ws/;

const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT ?? 3847);

const app = next({ dev, port });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  handle(req, res);
});

server.on("upgrade", (req, socket, head) => {
  const match = req.url?.match(TERMINAL_WS_RE);
  if (match) {
    handleUpgrade(req, socket, head, Number(match[1]));
  }
  // Non-terminal upgrades (HMR, etc.) fall through to Next.js's
  // internally attached upgrade handler — no action needed here.
});

server.listen(port, () => {
  console.log(`> issuectl dashboard on http://localhost:${port} (${dev ? "dev" : "prod"})`);
});

// Graceful shutdown
function shutdown() {
  console.log("[issuectl] shutting down...");
  server.close(() => {
    process.exit(0);
  });
  // Force exit after 5s if connections don't drain; unref so a clean
  // shutdown before the deadline doesn't hold the event loop open.
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
