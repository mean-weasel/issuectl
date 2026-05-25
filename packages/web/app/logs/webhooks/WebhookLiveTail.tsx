"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

type StreamState = "connecting" | "live" | "paused" | "reconnecting" | "offline";

type StreamMessage = {
  type?: string;
  payload?: {
    generatedAt?: string;
    entries?: unknown[];
    error?: string;
  };
};

export function WebhookLiveTail({ endpoint }: { endpoint: string }) {
  const [paused, setPaused] = useState(false);
  const [state, setState] = useState<StreamState>("connecting");
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [visibleEvents, setVisibleEvents] = useState(0);
  const reconnectRef = useRef<number | null>(null);

  useEffect(() => {
    if (paused) {
      setState("paused");
      return;
    }

    let socket: WebSocket | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      setState((current) => current === "offline" ? "reconnecting" : "connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}${endpoint}`);

      socket.addEventListener("open", () => {
        if (!cancelled) setState("live");
      });
      socket.addEventListener("message", (event) => {
        if (cancelled) return;
        const message = parseStreamMessage(event.data);
        const generatedAt = message?.payload?.generatedAt;
        if (generatedAt) setLastUpdate(generatedAt);
        if (Array.isArray(message?.payload?.entries)) {
          setVisibleEvents(message.payload.entries.length);
        }
      });
      socket.addEventListener("close", () => {
        if (cancelled) return;
        setState("offline");
        reconnectRef.current = window.setTimeout(connect, 2500);
      });
      socket.addEventListener("error", () => {
        if (!cancelled) setState("offline");
      });
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectRef.current !== null) {
        window.clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      socket?.close();
    };
  }, [endpoint, paused]);

  const label = paused ? "Resume" : "Pause";
  return (
    <div className={styles.liveTail} aria-label="Webhook live tail">
      <div>
        <span className={styles.liveLabel} data-state={state}>{state}</span>
        <span className={styles.liveMeta}>
          {lastUpdate ? `Updated ${new Date(lastUpdate).toLocaleTimeString()}` : `${visibleEvents} visible events`}
        </span>
      </div>
      <button className={styles.secondaryButton} type="button" onClick={() => setPaused((value) => !value)}>
        {label}
      </button>
    </div>
  );
}

function parseStreamMessage(value: unknown): StreamMessage | null {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as StreamMessage;
  } catch {
    return null;
  }
}
