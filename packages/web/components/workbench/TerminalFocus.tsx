"use client";

import { useEffect, useState } from "react";
import { ensureDeploymentTtyd } from "./workbench-api";
import type { WorkbenchDeployment, WorkbenchRepo } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type Props = {
  deployment: WorkbenchDeployment;
  repo: WorkbenchRepo | null;
};

export function TerminalFocus({ deployment, repo }: Props) {
  const issue = repo?.issues.find((item) => item.number === deployment.issueNumber);
  const title = issue?.title ?? "Issue session";
  const [terminal, setTerminal] = useState<{
    status: "loading" | "ready" | "error";
    port: number | null;
    token: string | null;
    error: string | null;
  }>({
    status: deployment.ttydPort ? "loading" : "error",
    port: deployment.ttydPort,
    token: null,
    error: deployment.ttydPort ? null : "Reconnect this session to open the terminal.",
  });

  useEffect(() => {
    let cancelled = false;
    if (!deployment.ttydPort) {
      setTerminal({
        status: "error",
        port: null,
        token: null,
        error: "Reconnect this session to open the terminal.",
      });
      return;
    }

    setTerminal({
      status: "loading",
      port: deployment.ttydPort,
      token: null,
      error: null,
    });

    ensureDeploymentTtyd(deployment.id)
      .then((result) => {
        if (cancelled) return;
        if (!("port" in result) || !result.terminalToken) {
          setTerminal({
            status: "error",
            port: deployment.ttydPort,
            token: null,
            error: "error" in result && result.error
              ? result.error
              : "Terminal auth token could not be created.",
          });
          return;
        }
        setTerminal({
          status: "ready",
          port: result.port,
          token: result.terminalToken,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTerminal({
          status: "error",
          port: deployment.ttydPort,
          token: null,
          error: err instanceof Error ? err.message : "Terminal is not available.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [deployment.id, deployment.ttydPort]);

  return (
    <div className={styles.terminalFocus}>
      <header className={styles.terminalHeader}>
        <div>
          <p className={styles.kicker}>Terminal</p>
          <h1>#{deployment.issueNumber} {title}</h1>
        </div>
        <div className={styles.terminalMeta}>
          <span>{deployment.agent}</span>
          <span>{deployment.branchName}</span>
        </div>
      </header>
      {terminal.status === "ready" && terminal.port && terminal.token ? (
        <iframe
          className={styles.terminalFrame}
          title={`Terminal for issue ${deployment.issueNumber}`}
          src={`/api/terminal/${terminal.port}/?terminalToken=${encodeURIComponent(terminal.token)}`}
        />
      ) : terminal.status === "loading" ? (
        <div className={styles.terminalUnavailable}>
          <h2>Connecting terminal</h2>
          <p>Preparing the terminal session.</p>
        </div>
      ) : (
        <div className={styles.terminalUnavailable}>
          <h2>No terminal port</h2>
          <p>{terminal.error}</p>
        </div>
      )}
    </div>
  );
}
