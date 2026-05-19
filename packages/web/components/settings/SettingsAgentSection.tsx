import { LAUNCH_AGENTS, launchAgentCommand, launchAgentLabel, type LaunchAgent } from "@/components/launch/agent";
import { cn } from "@/lib/cn";
import type { ArgsValidation, FormValues } from "./settings-form-types";
import styles from "./SettingsForm.module.css";

const AGENT_DETAILS: Record<LaunchAgent, string> = {
  claude: "Use Claude Code by default for new agent sessions.",
  codex: "Use Codex by default for new agent sessions.",
};

type Props = {
  values: FormValues;
  isPending: boolean;
  claudeArgsValidation: ArgsValidation;
  codexArgsValidation: ArgsValidation;
  onChange: (key: keyof FormValues, value: string | LaunchAgent) => void;
};

export function SettingsAgentSection({
  values,
  isPending,
  claudeArgsValidation,
  codexArgsValidation,
  onChange,
}: Props) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionTitle}>Agent Harness</div>
      <div className={styles.helpBlock}>
        Choose the default agentic harness for launches. You can still override
        the agent from the launch dialog for a single session.
      </div>
      <div className={styles.agentOptions} role="radiogroup" aria-labelledby="sf-launch-agent-label">
        <div id="sf-launch-agent-label" className={styles.label}>Default Agent</div>
        {LAUNCH_AGENTS.map((agent) => {
          const isSelected = values.launch_agent === agent;
          return (
            <label
              key={agent}
              className={cn(
                styles.agentOption,
                isSelected && styles.agentOptionSelected,
                isPending && styles.agentOptionDisabled,
              )}
            >
              <input
                type="radio"
                name="sf-launch-agent"
                className={styles.agentRadio}
                checked={isSelected}
                disabled={isPending}
                onChange={() => onChange("launch_agent", agent)}
              />
              <span>
                <span className={styles.agentLabel}>{launchAgentLabel(agent)}</span>
                <span className={styles.agentDetail}>{AGENT_DETAILS[agent]}</span>
              </span>
            </label>
          );
        })}
      </div>
      <div className={styles.row}>
        <AgentArgsField
          id="sf-claude-args"
          label="Claude Extra Args"
          value={values.claude_extra_args}
          command={launchAgentCommand("claude")}
          placeholder="--dangerously-skip-permissions"
          validation={claudeArgsValidation}
          isPending={isPending}
          onChange={(value) => onChange("claude_extra_args", value)}
        />
        <AgentArgsField
          id="sf-codex-args"
          label="Codex Extra Args"
          value={values.codex_extra_args}
          command={launchAgentCommand("codex")}
          placeholder="--model gpt-5"
          validation={codexArgsValidation}
          isPending={isPending}
          onChange={(value) => onChange("codex_extra_args", value)}
        />
      </div>
    </section>
  );
}

function AgentArgsField({
  id,
  label,
  value,
  command,
  placeholder,
  validation,
  isPending,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  command: string;
  placeholder: string;
  validation: ArgsValidation;
  isPending: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <input
        id={id}
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isPending}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
      />
      <div className={styles.help}>
        Passed verbatim after <code>{command}</code> when launching {command}.
        Leave empty for defaults.
      </div>
      {validation.errors.length > 0 && (
        <div className={styles.fieldError} role="alert">
          {validation.errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}
      {validation.errors.length === 0 && validation.warnings.length > 0 && (
        <div className={styles.fieldWarning}>
          {validation.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}
    </div>
  );
}
