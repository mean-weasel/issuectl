import { ensureTtydRunning } from "./terminal-lifecycle";

export { isValidTerminalPort } from "./terminal-lifecycle";
export { activeWsCount, handleUpgrade } from "./terminal-websocket";

/**
 * Proxy an HTTP request to a local ttyd instance and return the response.
 * Used by the Route Handlers to forward HTML/JS/CSS asset requests.
 */
export async function proxyHttpRequest(
  port: number,
  path: string,
): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  // Respawn ttyd if it exited since the last connection
  const alive = await ensureTtydRunning(port);
  if (!alive) {
    return {
      status: 502,
      headers: { "content-type": "text/plain" },
      body: Buffer.from("Terminal session has ended"),
    };
  }

  const url = `http://127.0.0.1:${port}${path}`;
  const res = await fetch(url);
  const body = Buffer.from(await res.arrayBuffer());
  const headers = Object.fromEntries(res.headers.entries());
  return { status: res.status, headers, body };
}

/**
 * Rewrite root-relative URLs in ttyd's HTML so asset requests route
 * back through the proxy. ttyd serves paths like `/token`,
 * `/auth_token.js`, etc. that need to become
 * `/api/terminal/{port}/token`, etc.
 */
export function rewriteHtml(html: string, port: number, terminalToken?: string): string {
  const prefix = `/api/terminal/${port}`;
  const token = terminalToken;
  const encodedToken = token ? encodeURIComponent(token) : "";
  const tokenQuery = encodedToken ? `?terminalToken=${encodedToken}` : "";
  const wsPatch = terminalToken
    ? `<script>(()=>{const token=${JSON.stringify(token)};const port=${JSON.stringify(port)};const Native=window.WebSocket;function AuthWebSocket(url,protocols){try{const u=new URL(url,window.location.href);if(u.origin===window.location.origin&&u.pathname.startsWith("/api/terminal/"+port+"/")&&!u.searchParams.has("terminalToken")){u.searchParams.set("terminalToken",token);url=u.toString();}}catch{}return protocols===undefined?new Native(url):new Native(url,protocols)}AuthWebSocket.prototype=Native.prototype;Object.setPrototypeOf(AuthWebSocket,Native);window.WebSocket=AuthWebSocket;})();</script>`
    : "";
  const rewritten = html
    .replace(/(href|src|action)="\/(?!\/)/g, `$1="${prefix}/`)
    .replace(/(href|src|action)='\/(?!\/)/g, `$1='${prefix}/`);
  const withToken = tokenQuery
    ? rewritten.replace(
        /(href|src|action)=(["'])(\/api\/terminal\/\d+\/[^"']*?)(["'])/g,
        (_match, attr: string, quote: string, url: string, endQuote: string) => {
          if (url.includes("terminalToken=")) return `${attr}=${quote}${url}${endQuote}`;
          const separator = url.includes("?") ? "&" : "?";
          return `${attr}=${quote}${url}${separator}terminalToken=${encodedToken}${endQuote}`;
        },
      )
    : rewritten;
  if (!wsPatch) return withToken;
  return withToken.includes("</head>")
    ? withToken.replace("</head>", `${wsPatch}</head>`)
    : `${wsPatch}${withToken}`;
}
