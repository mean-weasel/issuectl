import { NextRequest, NextResponse } from "next/server";
import { isValidTerminalPort, proxyHttpRequest, rewriteHtml } from "@/lib/terminal-proxy";
import { validateTerminalToken } from "@/lib/terminal-auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ port: string }> },
): Promise<NextResponse> {
  const { port: portStr } = await params;
  const port = Number(portStr);

  if (!isValidTerminalPort(port)) {
    return new NextResponse("Not Found", { status: 404 });
  }
  const terminalToken = request.nextUrl.searchParams.get("terminalToken");
  if (!validateTerminalToken(terminalToken, port)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const upstream = await proxyHttpRequest(port, "/");
    const contentType = upstream.headers["content-type"] ?? "";

    if (contentType.includes("text/html")) {
      const rewritten = rewriteHtml(upstream.body.toString("utf-8"), port, terminalToken ?? undefined);
      return new NextResponse(rewritten, {
        status: upstream.status,
        headers: { "content-type": contentType },
      });
    }

    return new NextResponse(new Uint8Array(upstream.body), {
      status: upstream.status,
      headers: { "content-type": contentType },
    });
  } catch (err) {
    console.error(`[issuectl] HTTP proxy error for port ${port}:`, err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED")) {
      return new NextResponse("Terminal not available", { status: 502 });
    }
    return new NextResponse("Proxy error", { status: 502 });
  }
}

export const HEAD = GET;
