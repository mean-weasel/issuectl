"use client";

import { useEffect, useState } from "react";
import {
  checkTerminalProxy,
  ensureDeploymentTtyd,
  isStaleEnsureTtydResult,
  terminalProxyUrl,
} from "./workbench-api";
import type { WorkbenchDeployment, WorkbenchRepo } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type Props = {
  deployment: WorkbenchDeployment;
  repo: WorkbenchRepo | null;
  pending: boolean;
  rowError?: string;
  onReconnect: (deployment: WorkbenchDeployment) => Promise<void> | void;
  onEnd: (deployment: WorkbenchDeployment) => void;
  onBackToOverview: () => void;
  onDeploymentStale: (deploymentId: number) => void;
};

export function TerminalFocus({
  deployment,
  repo,
  pending,
  rowError,
  onReconnect,
  onEnd,
  onBackToOverview,
  onDeploymentStale,
}: Props) {
  const issue = repo?.issues.find((item) => item.number === deployment.issueNumber);
  const title = issue?.title ?? "Issue session";
  const [terminal, setTerminal] = useState<{
    status: "loading" | "ready" | "error";
    port: number | null;
    token: string | null;
    src: string | null;
    error: string | null;
  }>({
    status: deployment.ttydPort ? "loading" : "error",
    port: deployment.ttydPort,
    token: null,
    src: null,
    error: deployment.ttydPort ? null : "Reconnect this session to open the terminal.",
  });
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    if (!deployment.ttydPort) {
      setTerminal({
        status: "error",
        port: null,
        token: null,
        src: null,
        error: "Reconnect this session to open the terminal.",
      });
      return;
    }

    setTerminal({
      status: "loading",
      port: deployment.ttydPort,
      token: null,
      src: null,
      error: null,
    });

    ensureDeploymentTtyd(deployment.id)
      .then(async (result) => {
        if (cancelled) return;
        if (!("port" in result) || !result.terminalToken) {
          if (isStaleEnsureTtydResult(result)) {
            onDeploymentStale(deployment.id);
            return;
          }
          setTerminal({
            status: "error",
            port: deployment.ttydPort,
            token: null,
            src: null,
            error: "error" in result && result.error
              ? result.error
              : "Terminal auth token could not be created.",
          });
          return;
        }

        const proxy = await checkTerminalProxy(result.port, result.terminalToken, controller.signal);
        if (cancelled) return;
        if (!proxy.ok) {
          setTerminal({
            status: "error",
            port: result.port,
            token: result.terminalToken,
            src: null,
            error: proxy.error,
          });
          return;
        }

        setTerminal({
          status: "ready",
          port: result.port,
          token: result.terminalToken,
          src: terminalProxyUrl(result.port, result.terminalToken),
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setTerminal({
          status: "error",
          port: deployment.ttydPort,
          token: null,
          src: null,
          error: err instanceof Error ? err.message : "Terminal is not available.",
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [deployment.id, deployment.ttydPort, onDeploymentStale, retryAttempt]);

  async function reconnectTerminal() {
    await onReconnect(deployment);
    setRetryAttempt((current) => current + 1);
  }

  return (
    <div className={styles.terminalFocus}>
      <header className={styles.terminalHeader}>
        <div>
          <p className={styles.kicker}>Terminal</p>
          <h1>#{deployment.issueNumber} {title}</h1>
        </div>
        <div className={styles.terminalMeta}>
          <span>{repo ? `${repo.owner}/${repo.name}` : `${deployment.owner}/${deployment.repoName}`}</span>
          <span>{deployment.agent}</span>
          <span>{deployment.branchName}</span>
        </div>
      </header>
      {terminal.status === "ready" && terminal.src ? (
        <iframe
          className={styles.terminalFrame}
          title={`Terminal for issue ${deployment.issueNumber}`}
          src={terminal.src}
        />
      ) : terminal.status === "loading" ? (
        <div className={styles.terminalUnavailable}>
          <h2>Connecting terminal</h2>
          <p>Preparing the terminal session.</p>
        </div>
      ) : (
        <div className={styles.terminalUnavailable} role="alert">
          <h2>Terminal unavailable</h2>
          <p>{terminal.error}</p>
          <div className={styles.terminalRecoveryActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={pending}
              onClick={reconnectTerminal}
            >
              Reconnect session
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onBackToOverview}
            >
              Back to overview
            </button>
            <details className={styles.endDetails}>
              <summary>End</summary>
              <div className={styles.confirmBox}>
                <strong>End session?</strong>
                <button
                  type="button"
                  onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}
                >
                  Cancel
                </button>
                <button type="button" disabled={pending} onClick={() => onEnd(deployment)}>
                  End session
                </button>
              </div>
            </details>
          </div>
          {rowError && <p className={styles.rowError}>{rowError}</p>}
        </div>
      )}
    </div>
  );
}
