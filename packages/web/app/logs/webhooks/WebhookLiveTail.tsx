"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

type StreamState = "connecting" | "live" | "paused" | "reconnecting" | "offline";

type StreamMessage = {
  type?: string;
  payload?: {
    generatedAt?: string;
    entries?: unknown[];
    counts?: Record<string, number>;
    error?: string;
  };
};

export function WebhookLiveTail({ endpoint }: { endpoint: string }) {
  const [paused, setPaused] = useState(false);
  const [state, setState] = useState<StreamState>("connecting");
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [visibleEvents, setVisibleEvents] = useState(0);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
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
      const apiToken = readApiToken();
      if (!apiToken) {
        setState("offline");
        return;
      }
      setState((current) => current === "offline" ? "reconnecting" : "connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = new URL(`${protocol}//${window.location.host}${endpoint}`);
      url.searchParams.set("apiToken", apiToken);
      socket = new WebSocket(url);

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
        if (isCounts(message?.payload?.counts)) {
          setCounts(message.payload.counts);
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
          {lastUpdate
            ? `Updated ${new Date(lastUpdate).toLocaleTimeString()} · ${liveSummary(counts, visibleEvents)}`
            : liveSummary(counts, visibleEvents)}
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

function readApiToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("issuectl.apiToken");
}

function isCounts(value: unknown): value is Record<string, number> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function liveSummary(counts: Record<string, number> | null, visibleEvents: number): string {
  if (!counts) return `${visibleEvents} visible events`;
  return `${counts.total ?? visibleEvents} visible · ${counts.fired ?? 0} fired · ${counts.debouncing ?? 0} debouncing · ${counts.failed ?? 0} failed`;
}
