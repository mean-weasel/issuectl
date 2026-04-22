import { NextRequest, NextResponse } from "next/server";
import { isValidTerminalPort, proxyHttpRequest, rewriteHtml } from "@/lib/terminal-proxy";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ port: string }> },
): Promise<NextResponse> {
  const { port: portStr } = await params;
  const port = Number(portStr);

  if (!isValidTerminalPort(port)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const upstream = await proxyHttpRequest(port, "/");
    const contentType = upstream.headers["content-type"] ?? "";

    if (contentType.includes("text/html")) {
      const rewritten = rewriteHtml(upstream.body.toString("utf-8"), port);
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
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED")) {
      return new NextResponse("Terminal not available", { status: 502 });
    }
    return new NextResponse("Proxy error", { status: 502 });
  }
}
