"use client";

import { cn } from "@/lib/cn";
import { LAUNCH_AGENTS, launchAgentLabel, type LaunchAgent } from "./agent";
import styles from "./AgentSelector.module.css";

type Props = {
  value: LaunchAgent;
  onChange: (value: LaunchAgent) => void;
  disabled?: boolean;
};

const DETAILS: Record<LaunchAgent, string> = {
  claude: "Launches the issue context with Claude Code.",
  codex: "Launches the issue context with Codex.",
};

export function AgentSelector({ value, onChange, disabled = false }: Props) {
  return (
    <div className={styles.field}>
      <div className={styles.label}>Agent</div>
      <div className={styles.options}>
        {LAUNCH_AGENTS.map((agent) => {
          const isSelected = value === agent;
          return (
            <label
              key={agent}
              className={cn(
                styles.option,
                isSelected && styles.selected,
                disabled && styles.disabled,
              )}
            >
              <input
                type="radio"
                name="launch-agent"
                className={styles.radio}
                checked={isSelected}
                disabled={disabled}
                onChange={() => onChange(agent)}
              />
              <div>
                <div className={styles.optionLabel}>{launchAgentLabel(agent)}</div>
                <div className={styles.optionDetail}>{DETAILS[agent]}</div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
