import type { LaunchAgent } from "@/components/launch/agent";

export type FormValues = {
  branch_pattern: string;
  cache_ttl: string;
  claude_extra_args: string;
  codex_extra_args: string;
  launch_agent: LaunchAgent;
  idle_grace_period: string;
  idle_threshold: string;
  public_webhook_base_url: string;
};

export type ArgsValidation = {
  ok: boolean;
  errors: readonly string[];
  warnings: readonly string[];
};
