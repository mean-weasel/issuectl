"use client";

import { useCallback, useEffect, useState } from "react";
import {
  checkTerminalProxy,
  ensureDeploymentTtyd,
  isStaleEnsureTtydResult,
  terminalProxyUrl,
} from "./workbench-api";
import { PtyTerminal, type PtyLifecycleState } from "./PtyTerminal";
import type { WorkbenchDeployment, WorkbenchRepo } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type TerminalLifecycle = PtyLifecycleState | "ready" | "respawned";

type TerminalState = {
  status: "loading" | "ready" | "error";
  port: number | null;
  token: string | null;
  src: string | null;
  backend: "ttyd" | "pty_bridge" | null;
  wsUrl: string | null;
  error: string | null;
  lifecycle: TerminalLifecycle | null;
};

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
  const targetType = deployment.targetType ?? "issue";
  const targetNumber = deployment.targetNumber ?? deployment.issueNumber;
  const targetLabel = targetType === "pr" ? `PR #${targetNumber}` : `#${targetNumber}`;
  const terminalTitle = targetType === "pr" ? `Terminal for PR ${targetNumber}` : `Terminal for issue ${targetNumber}`;
  const issue = targetType === "issue"
    ? repo?.issues.find((item) => item.number === targetNumber)
    : undefined;
  const title = issue?.title ?? (targetType === "pr" ? "PR review session" : "Issue session");
  const [terminal, setTerminal] = useState<TerminalState>({
    status: deployment.ttydPort || deployment.terminalBackend === "pty_bridge" ? "loading" : "error",
    port: deployment.ttydPort,
    token: null,
    src: null,
    backend: deployment.terminalBackend ?? "ttyd",
    wsUrl: null,
    error: deployment.ttydPort || deployment.terminalBackend === "pty_bridge"
      ? null
      : "Reconnect this session to open the terminal.",
    lifecycle: deployment.ttydPort || deployment.terminalBackend === "pty_bridge" ? "connecting" : "error",
  });
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);
  const handlePtyError = useCallback((error: string) => {
    setTerminal((current) => ({ ...current, status: "error", error }));
  }, []);
  const handlePtyLifecycle = useCallback((state: PtyLifecycleState) => {
    setTerminal((current) => ({ ...current, lifecycle: state }));
  }, []);
  const diagnosticsCommand = diagnosticsCommandForDeployment(deployment.id);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    if (!deployment.ttydPort && deployment.terminalBackend !== "pty_bridge") {
      setTerminal({
        status: "error",
        port: null,
        token: null,
        src: null,
        backend: deployment.terminalBackend ?? "ttyd",
        wsUrl: null,
        error: "Reconnect this session to open the terminal.",
        lifecycle: "error",
      });
      return;
    }

    setTerminal({
      status: "loading",
      port: deployment.ttydPort,
      token: null,
      src: null,
      backend: deployment.terminalBackend ?? "ttyd",
      wsUrl: null,
      error: null,
      lifecycle: "connecting",
    });
    setDiagnosticsCopied(false);

    ensureDeploymentTtyd(deployment.id)
      .then(async (result) => {
        if (cancelled) return;
        if ("wsUrl" in result) {
          setTerminal({
            status: "ready",
            port: null,
            token: result.terminalToken,
            src: null,
            backend: "pty_bridge",
            wsUrl: result.wsUrl,
            error: null,
            lifecycle: "connecting",
          });
          return;
        }
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
            backend: deployment.terminalBackend ?? "ttyd",
            wsUrl: null,
            error: "error" in result && result.error
              ? result.error
              : "Terminal auth token could not be created.",
            lifecycle: "error",
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
            backend: "ttyd",
            wsUrl: null,
            error: proxy.error,
            lifecycle: "error",
          });
          return;
        }

        setTerminal({
          status: "ready",
          port: result.port,
          token: result.terminalToken,
          src: terminalProxyUrl(result.port, result.terminalToken),
          backend: "ttyd",
          wsUrl: null,
          error: null,
          lifecycle: result.respawned ? "respawned" : "ready",
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
          backend: deployment.terminalBackend ?? "ttyd",
          wsUrl: null,
          error: err instanceof Error ? err.message : "Terminal is not available.",
          lifecycle: "error",
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [deployment.id, deployment.terminalBackend, deployment.ttydPort, onDeploymentStale, retryAttempt]);

  async function reconnectTerminal() {
    await onReconnect(deployment);
    setRetryAttempt((current) => current + 1);
  }

  async function copyDiagnosticsCommand() {
    try {
      await navigator.clipboard.writeText(diagnosticsCommand);
      setDiagnosticsCopied(true);
    } catch {
      setDiagnosticsCopied(false);
    }
  }

  return (
    <div className={styles.terminalFocus}>
      <header className={styles.terminalHeader}>
        <div>
          <p className={styles.kicker}>Terminal</p>
          <h1>{targetLabel} {title}</h1>
        </div>
        <div className={styles.terminalMeta}>
          <span>{repo ? `${repo.owner}/${repo.name}` : `${deployment.owner}/${deployment.repoName}`}</span>
          <span>{deployment.agent}</span>
          <span>{deployment.branchName}</span>
        </div>
        <button type="button" className={styles.secondaryButton} onClick={onBackToOverview}>
          Back to overview
        </button>
      </header>
      <section className={styles.terminalDiagnostics} aria-label="Terminal diagnostics">
        <span className={styles.diagnosticBadge}>{backendLabel(terminal.backend ?? deployment.terminalBackend)}</span>
        <span>Deployment #{deployment.id}</span>
        <span>{terminalStateLabel(terminal)}</span>
        <code>{diagnosticsCommand}</code>
        <button type="button" className={styles.secondaryButton} onClick={() => void copyDiagnosticsCommand()}>
          {diagnosticsCopied ? "Copied" : "Copy diagnostics command"}
        </button>
      </section>
      {terminal.status === "ready" && terminal.backend === "pty_bridge" && terminal.wsUrl ? (
        <div className={styles.terminalFrame}>
          <PtyTerminal
            title={terminalTitle}
            wsUrl={terminal.wsUrl}
            onError={handlePtyError}
            onLifecycle={handlePtyLifecycle}
          />
        </div>
      ) : terminal.status === "ready" && terminal.src ? (
        <iframe
          className={styles.terminalFrame}
          title={terminalTitle}
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

function diagnosticsCommandForDeployment(deploymentId: number): string {
  return `pnpm --dir packages/cli exec issuectl diag show --deployment ${deploymentId}`;
}

function backendLabel(backend: "ttyd" | "pty_bridge" | null | undefined): string {
  return backend === "pty_bridge" ? "PTY bridge" : "TTYD";
}

function terminalStateLabel(terminal: TerminalState): string {
  if (terminal.status === "error") return "Terminal error";
  if (terminal.backend === "pty_bridge") {
    if (terminal.lifecycle === "first_output") return "PTY first output seen";
    if (terminal.lifecycle === "attached") return "PTY attached";
    if (terminal.lifecycle === "connected") return "PTY websocket connected";
    if (terminal.lifecycle === "closed") return "PTY websocket closed";
    if (terminal.lifecycle === "error") return "PTY error";
    return "PTY connecting";
  }
  if (terminal.status === "ready") return terminal.lifecycle === "respawned" ? "TTYD respawned" : "TTYD ready";
  return "TTYD connecting";
}
