"use client";

import { useState, useTransition } from "react";
import type { ParsedIssuesResponse } from "@issuectl/core";
import { parseNaturalLanguage } from "@/lib/actions/parse";
import { Button } from "@/components/ui/Button";
import styles from "./ParseInput.module.css";

type Props = {
  onParsed: (data: ParsedIssuesResponse) => void;
};

export function ParseInput({ onParsed }: Props) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
      />
      <div className={styles.footer}>
        <Button
          variant="primary"
          onClick={handleParse}
          disabled={isPending || !input.trim()}
        >
          {isPending ? "Parsing..." : "Parse with Claude"}
        </Button>
        {isPending && (
          <>
            <div className={styles.spinner} />
            <span className={styles.parsingText}>
              Claude is analyzing your input...
            </span>
          </>
        )}
      </div>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
