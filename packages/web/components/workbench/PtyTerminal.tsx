"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import styles from "./PtyTerminal.module.css";

type Props = {
  wsUrl: string;
  title: string;
  onError: (message: string) => void;
};

type ServerMessage =
  | { type: "ready" }
  | { type: "output"; data: string }
  | { type: "exit"; code?: number; signal?: string }
  | { type: "error"; message: string };

export function PtyTerminal({ wsUrl, title, onError }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: "var(--paper-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      lineHeight: 1.35,
      scrollback: 2_000,
      theme: {
        background: "#10130f",
        black: "#10130f",
        blue: "#8aa7d8",
        brightBlack: "#6f756b",
        brightBlue: "#adc6f0",
        brightCyan: "#97d8c9",
        brightGreen: "#b7d28a",
        brightRed: "#eba493",
        brightWhite: "#fffaf0",
        brightYellow: "#ead68b",
        cursor: "#f4e8c8",
        cyan: "#79bfb1",
        foreground: "#f2ead8",
        green: "#9fbd73",
        red: "#d37d6c",
        selectionBackground: "#4d4634",
        white: "#f2ead8",
        yellow: "#d6bd63",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);

    const ws = new WebSocket(toAbsoluteWsUrl(wsUrl));
    let disposed = false;
    const disposables = [
      terminal.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }));
        }
      }),
    ];

    function fitAndReport() {
      try {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
        }
      } catch {
        // xterm can briefly have no measurable container while React lays out.
      }
    }

    const resizeObserver = new ResizeObserver(fitAndReport);
    resizeObserver.observe(container);

    ws.addEventListener("open", fitAndReport);
    ws.addEventListener("message", (event) => {
      const message = parseServerMessage(event.data);
      if (!message) return;
      if (message.type === "output") {
        terminal.write(message.data);
      } else if (message.type === "exit") {
        terminal.writeln("");
        terminal.writeln(`[terminal attach exited${message.code === undefined ? "" : `: ${message.code}`}]`);
      } else if (message.type === "error") {
        onError(message.message);
      }
    });
    ws.addEventListener("close", (event) => {
      if (disposed) return;
      if (event.code !== 1000 && event.code !== 1005) {
        onError("PTY terminal connection closed.");
      }
    });
    ws.addEventListener("error", () => {
      if (!disposed) onError("PTY terminal connection failed.");
    });

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      for (const disposable of disposables) disposable.dispose();
      terminal.dispose();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, "component unmounted");
      }
    };
  }, [onError, wsUrl]);

  return <div ref={containerRef} className={styles.terminal} role="application" aria-label={title} />;
}

function toAbsoluteWsUrl(path: string): string {
  if (path.startsWith("ws://") || path.startsWith("wss://")) return path;
  const base = new URL(path, window.location.href);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  return base.toString();
}

function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data) as Partial<ServerMessage>;
    if (parsed.type === "ready") return { type: "ready" };
    if (parsed.type === "output" && typeof parsed.data === "string") return parsed as ServerMessage;
    if (parsed.type === "exit") return parsed as ServerMessage;
    if (parsed.type === "error" && typeof parsed.message === "string") return parsed as ServerMessage;
  } catch {
    return null;
  }
  return null;
}
