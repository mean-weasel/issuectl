import { NextRequest, NextResponse } from "next/server";
import { isValidTerminalPort, proxyHttpRequest } from "@/lib/terminal-proxy";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ port: string; path: string[] }> },
): Promise<NextResponse> {
  const { port: portStr, path } = await params;
  const port = Number(portStr);

  if (!isValidTerminalPort(port)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  if (path.some((seg) => seg === ".." || seg === ".")) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const upstreamPath = "/" + path.join("/");

  try {
    const upstream = await proxyHttpRequest(port, upstreamPath);
    return new NextResponse(new Uint8Array(upstream.body), {
      status: upstream.status,
      headers: { "content-type": upstream.headers["content-type"] ?? "application/octet-stream" },
    });
  } catch (err) {
    console.error(`[issuectl] HTTP proxy error for port ${port} path ${upstreamPath}:`, err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED")) {
      return new NextResponse("Terminal not available", { status: 502 });
    }
    return new NextResponse("Proxy error", { status: 502 });
  }
}
