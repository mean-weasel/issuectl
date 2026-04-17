"use client";

import { useState, useEffect, useTransition } from "react";
import type { ParsedIssuesResponse } from "@issuectl/core";
import { parseNaturalLanguage } from "@/lib/actions/parse";
import { Button } from "@/components/paper";
import styles from "./ParseInput.module.css";

type Props = {
  onParsed: (data: ParsedIssuesResponse) => void;
};

const PROGRESS_STAGES = [
  { label: "Reading your input...", delayMs: 0 },
  { label: "Identifying repos and labels...", delayMs: 4000 },
  { label: "Structuring issues...", delayMs: 12000 },
  { label: "Finalizing...", delayMs: 30000 },
] as const;

function useProgressStage(active: boolean): string {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setStageIndex(0);
      return;
    }

    setStageIndex(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < PROGRESS_STAGES.length; i++) {
      timers.push(setTimeout(() => setStageIndex(i), PROGRESS_STAGES[i].delayMs));
    }
    return () => timers.forEach(clearTimeout);
  }, [active]);

  return PROGRESS_STAGES[stageIndex].label;
}

export function ParseInput({ onParsed }: Props) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const stageLabel = useProgressStage(isPending);

  function handleParse() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await parseNaturalLanguage(input);
        if (!result.success) {
          setError(result.error);
          return;
        }
        if (result.data.parsed.issues.length === 0) {
          setError("No issues were parsed from the input. Try being more specific.");
          return;
        }
        onParsed(result.data.parsed);
      } catch (err) {
        setError(
          err instanceof Error
            ? `Connection error: ${err.message}`
            : "An unexpected error occurred. Please try again.",
        );
      }
    });
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.description}>
        Describe one or more issues in plain language. Claude will parse them
        into structured GitHub issues and match them to your connected repos.
      </div>
      <textarea
        className={styles.textarea}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="e.g. Fix the login timeout bug in seatify and add search functionality to the dashboard..."
        disabled={isPending}
        autoFocus
        autoComplete="off"
        autoCapitalize="sentences"
        spellCheck={true}
        aria-label="Issue description for Claude to parse"
        maxLength={8192}
      />
      {isPending ? (
        <div className={styles.progressBar} role="status" aria-live="polite">
          <div className={styles.progressTrack}>
            <div className={styles.progressPulse} />
          </div>
          <span className={styles.progressLabel}>{stageLabel}</span>
        </div>
      ) : (
        <div className={styles.footer}>
          <Button
            variant="primary"
            onClick={handleParse}
            disabled={!input.trim()}
          >
            Parse with Claude
          </Button>
        </div>
      )}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
