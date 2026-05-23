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
  const browserApiPatch = terminalToken
    ? `<script>${[
        "(()=>{",
        `const token=${JSON.stringify(token)};`,
        `const port=${JSON.stringify(port)};`,
        "try{",
        "const current=new URL(window.location.href);",
        "const hadTerminalToken=current.searchParams.has('terminalToken');",
        "current.searchParams.delete('terminalToken');",
        "if(hadTerminalToken)window.history.replaceState(window.history.state,'',current.toString());",
        "}catch{}",
        "function authUrl(url){",
        "const u=new URL(url,window.location.href);",
        "if(u.host===window.location.host&&u.pathname.startsWith('/api/terminal/'+port+'/')&&!u.searchParams.has('terminalToken'))u.searchParams.set('terminalToken',token);",
        "return u;",
        "}",
        "const NativeWebSocket=window.WebSocket;",
        "function AuthWebSocket(url,protocols){",
        "try{url=authUrl(url).toString();}catch{}",
        "return protocols===undefined?new NativeWebSocket(url):new NativeWebSocket(url,protocols);",
        "}",
        "AuthWebSocket.prototype=NativeWebSocket.prototype;",
        "Object.setPrototypeOf(AuthWebSocket,NativeWebSocket);",
        "window.WebSocket=AuthWebSocket;",
        "const nativeFetch=window.fetch;",
        "window.fetch=function(input,init){",
        "try{",
        "if(input instanceof Request){input=new Request(authUrl(input.url).toString(),input);}",
        "else{input=authUrl(input).toString();}",
        "}catch{}",
        "return nativeFetch.call(this,input,init);",
        "};",
        "const nativeOpen=XMLHttpRequest.prototype.open;",
        "XMLHttpRequest.prototype.open=function(method,url,...rest){",
        "try{url=authUrl(url).toString();}catch{}",
        "return nativeOpen.call(this,method,url,...rest);",
        "};",
        "})();",
      ].join("")}</script>`
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
  if (!browserApiPatch) return withToken;
  return withToken.includes("<head>")
    ? withToken.replace("<head>", `<head>${browserApiPatch}`)
    : withToken.includes("</head>")
      ? withToken.replace("</head>", `${browserApiPatch}</head>`)
    : `${browserApiPatch}${withToken}`;
}
