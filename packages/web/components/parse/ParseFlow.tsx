"use client";

import { useState } from "react";
import type { GitHubLabel, ParsedIssuesResponse, BatchCreateResult } from "@issuectl/core";
import type { RepoOption } from "@/lib/types";
import { ParseInput } from "./ParseInput";
import { ParseReview } from "./ParseReview";
import { ParseResults } from "./ParseResults";
import styles from "./ParseFlow.module.css";

type Step = "input" | "review" | "results";

type Props = {
  repos: RepoOption[];
  labelsPerRepo: Record<string, GitHubLabel[]>;
  claudeAvailable: boolean;
  initError?: string;
};

export function ParseFlow({ repos, labelsPerRepo, claudeAvailable, initError }: Props) {
  const [step, setStep] = useState<Step>("input");
  const [parsedData, setParsedData] = useState<ParsedIssuesResponse | null>(null);
  const [results, setResults] = useState<BatchCreateResult | null>(null);

  if (initError) {
    return (
      <div className={styles.unavailable} role="alert">
        {initError}
      </div>
    );
  }

  if (!claudeAvailable) {
    return (
      <div className={styles.unavailable}>
        Claude CLI is not installed. Quick Create uses the Claude CLI to parse
        natural language into GitHub issues.
        <br />
        <br />
        Install it with: <code>npm install -g @anthropic-ai/claude-code</code>
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <div className={styles.unavailable}>
        No repositories connected. Add repos in Settings before using Quick Create.
      </div>
    );
  }

  return (
    <>
      {step === "input" && (
        <ParseInput
          onParsed={(data) => {
            setParsedData(data);
            setStep("review");
          }}
        />
      )}
      {step === "review" && parsedData && (
        <ParseReview
          parsed={parsedData}
          repos={repos}
          labelsPerRepo={labelsPerRepo}
          onConfirm={(batchResult) => {
            setResults(batchResult);
            setStep("results");
          }}
          onBack={() => setStep("input")}
        />
      )}
      {step === "results" && results && (
        <ParseResults
          results={results}
          onReset={() => {
            setParsedData(null);
            setResults(null);
            setStep("input");
          }}
        />
      )}
    </>
  );
}
