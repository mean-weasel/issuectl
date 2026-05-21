import { NextRequest, NextResponse } from "next/server";
import { isValidTerminalPort, proxyHttpRequest, rewriteHtml } from "@/lib/terminal-proxy";
import { terminalTokenFromRequest, validateTerminalToken } from "@/lib/terminal-auth";
import { recordTerminalEventForPort } from "@/lib/terminal-diagnostics";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ port: string }> },
): Promise<NextResponse> {
  const { port: portStr } = await params;
  const port = Number(portStr);

  if (!isValidTerminalPort(port)) {
    recordTerminalEventForPort(port, {
      level: "warn",
      event: "terminal.port_invalid",
      source: "web.terminal-route",
      status: "not_found",
    });
    return new NextResponse("Not Found", { status: 404 });
  }
  const terminalToken = terminalTokenFromRequest(request.nextUrl, port, request.headers.get("referer"));
  if (!validateTerminalToken(terminalToken, port)) {
    recordTerminalEventForPort(port, {
      level: "warn",
      event: "terminal.auth_failed",
      source: "web.terminal-route",
      status: "unauthorized",
    });
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const upstream = await proxyHttpRequest(port, "/");
    recordTerminalEventForPort(port, {
      level: upstream.status >= 400 ? "warn" : "info",
      event: upstream.status >= 400
        ? "terminal.proxy_probe_failed"
        : "terminal.proxy_probe_succeeded",
      source: "web.terminal-route",
      status: String(upstream.status),
      data: { statusCode: upstream.status },
    });
    const contentType = upstream.headers["content-type"] ?? "";

    if (contentType.includes("text/html")) {
      const rewritten = rewriteHtml(upstream.body.toString("utf-8"), port, terminalToken ?? undefined);
      return new NextResponse(rewritten, {
        status: upstream.status,
        headers: { "content-type": contentType, "referrer-policy": "same-origin" },
      });
    }

    return new NextResponse(new Uint8Array(upstream.body), {
      status: upstream.status,
      headers: { "content-type": contentType },
    });
  } catch (err) {
    console.error(`[issuectl] HTTP proxy error for port ${port}:`, err);
    recordTerminalEventForPort(port, {
      level: "error",
      event: "terminal.proxy_probe_failed",
      source: "web.terminal-route",
      message: err instanceof Error ? err.message : String(err),
    });
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED")) {
      return new NextResponse("Terminal not available", { status: 502 });
    }
    return new NextResponse("Proxy error", { status: 502 });
  }
}

export const HEAD = GET;
