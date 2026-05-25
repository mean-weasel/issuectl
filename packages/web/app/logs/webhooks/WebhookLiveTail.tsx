"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

type StreamState = "connecting" | "live" | "paused" | "reconnecting" | "offline";

type StreamEntry = {
  id?: number;
  deliveryId?: string;
  eventType?: string;
  action?: string | null;
  targetType?: "issue" | "pr" | null;
  targetNumber?: number | null;
  result?: string | null;
  resultDetail?: string | null;
  receivedAt?: number;
  intent?: { id?: number; status?: string; signalCount?: number } | null;
};

type StreamMessage = {
  type?: string;
  payload?: {
    generatedAt?: string;
    entries?: StreamEntry[];
    counts?: Record<string, number>;
    error?: string;
  };
};

export function WebhookLiveTail({
  endpoint,
  initialEntries = [],
  initialCounts = null,
}: {
  endpoint: string;
  initialEntries?: StreamEntry[];
  initialCounts?: Record<string, number> | null;
}) {
  const [paused, setPaused] = useState(false);
  const [state, setState] = useState<StreamState>("connecting");
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [visibleEvents, setVisibleEvents] = useState(initialEntries.length);
  const [counts, setCounts] = useState<Record<string, number> | null>(initialCounts);
  const [entries, setEntries] = useState<StreamEntry[]>(initialEntries);
  const [pendingEntries, setPendingEntries] = useState<StreamEntry[]>([]);
  const reconnectRef = useRef<number | null>(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
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
          if (pausedRef.current) {
            setState("paused");
            setPendingEntries((current) => mergeEntries(message.payload?.entries ?? [], current));
          } else {
            setEntries(message.payload.entries);
            setPendingEntries([]);
          }
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
  }, [endpoint]);

  useEffect(() => {
    setState((current) => paused ? "paused" : current === "paused" ? "live" : current);
  }, [paused]);

  function mergePending() {
    setEntries((current) => mergeEntries(pendingEntries, current));
    setPendingEntries([]);
    setPaused(false);
  }

  const label = paused ? "Resume" : "Pause";
  const latestEntries = entries.slice(0, 5);
  return (
    <div className={styles.liveTail} aria-label="Webhook live tail" data-has-pending={pendingEntries.length > 0}>
      <div className={styles.liveTailHeader}>
        <div>
          <span className={styles.liveLabel} data-state={state}>{state}</span>
          <span className={styles.liveMeta}>
            {lastUpdate
              ? `Updated ${new Date(lastUpdate).toLocaleTimeString()} · ${liveSummary(counts, visibleEvents)}`
              : liveSummary(counts, visibleEvents)}
          </span>
        </div>
        <div className={styles.liveActions}>
          {pendingEntries.length > 0 && (
            <button className={styles.secondaryButton} type="button" onClick={mergePending}>
              Merge {pendingEntries.length} new
            </button>
          )}
          <button className={styles.secondaryButton} type="button" onClick={() => setPaused((value) => !value)}>
            {label}
          </button>
        </div>
      </div>
      {pendingEntries.length > 0 && (
        <p className={styles.livePending}>{pendingEntries.length} new webhook events waiting while paused.</p>
      )}
      {latestEntries.length > 0 && (
        <table className={styles.liveTable} aria-label="Latest webhook stream rows">
          <thead>
            <tr>
              <th>Delivery</th>
              <th>Event</th>
              <th>Target</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {latestEntries.map((entry) => (
              <tr key={entry.id ?? entry.deliveryId}>
                <td>{shortId(entry.deliveryId ?? "unknown")}</td>
                <td>{entry.eventType ?? "webhook"}{entry.action ? `.${entry.action}` : ""}</td>
                <td>{streamTarget(entry)}</td>
                <td><span className={styles.result} data-result={entry.result ?? "received"}>{entry.result ?? "received"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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

function mergeEntries(next: StreamEntry[], current: StreamEntry[]): StreamEntry[] {
  const merged = new Map<string, StreamEntry>();
  for (const entry of [...next, ...current]) {
    merged.set(entryKey(entry), entry);
  }
  return [...merged.values()]
    .sort((a, b) => (b.receivedAt ?? 0) - (a.receivedAt ?? 0))
    .slice(0, 20);
}

function entryKey(entry: StreamEntry): string {
  return String(entry.id ?? entry.deliveryId ?? `${entry.eventType}:${entry.receivedAt}`);
}

function streamTarget(entry: StreamEntry): string {
  if (!entry.targetType || !entry.targetNumber) return "repo";
  return `${entry.targetType === "pr" ? "PR" : "issue"} #${entry.targetNumber}`;
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 10)}...` : value;
}

function liveSummary(counts: Record<string, number> | null, visibleEvents: number): string {
  if (!counts) return `${visibleEvents} visible events`;
  return `${counts.total ?? visibleEvents} visible · ${counts.fired ?? 0} fired · ${counts.debouncing ?? 0} debouncing · ${counts.failed ?? 0} failed`;
}
