import { NextResponse, type NextRequest } from "next/server";
import { getPublicIp, getLanIp } from "./lib/network-info.js";

export function middleware(request: NextRequest): NextResponse {
  if (!process.env.ISSUECTL_TUNNEL_URL) {
    return NextResponse.next();
  }

  const clientIp = request.headers.get("cf-connecting-ip");
  if (!clientIp) {
    return NextResponse.next();
  }

  const serverPublicIp = getPublicIp();
  const serverLanIp = getLanIp();
  if (!serverPublicIp || !serverLanIp) {
    return NextResponse.next();
  }

  if (clientIp !== serverPublicIp) {
    return NextResponse.next();
  }

  const port = Number(process.env.PORT) || 3847;
  const url = request.nextUrl.clone();
  const lanUrl = `http://${serverLanIp}:${port}${url.pathname}${url.search}`;
  return NextResponse.redirect(lanUrl, 302);
}

export const config = {
  matcher: [
    "/((?!_next|api|favicon|icon|apple-touch-icon|manifest|sw|offline).*)",
  ],
};
