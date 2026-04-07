"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { addRepo } from "@/lib/actions/repos";
import styles from "./WelcomeScreen.module.css";

export function WelcomeScreen() {
  const router = useRouter();
  const [repo, setRepo] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setWarning(null);

    const parts = repo.trim().split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setError("Enter a valid repository in owner/repo format");
      return;
    }

    setSubmitting(true);
    const result = await addRepo(parts[0], parts[1], localPath.trim() || undefined);
    setSubmitting(false);

    if (!result.success) {
      setError(result.error ?? "Failed to add repository");
      return;
    }

    if (result.warning) {
      setWarning(result.warning);
    }

    router.refresh();
  }

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.logoMark}>ic</div>
        <h1 className={styles.title}>
          Welcome to <span className={styles.accent}>issuectl</span>
        </h1>
        <p className={styles.description}>
          Manage GitHub issues and PRs across all your repos from one place.
          Launch any issue directly into Claude Code with a single click.
        </p>

        <div className={styles.card}>
          <div className={styles.cardTitle}>Add your first repository</div>

          <div>
            <label className={styles.label}>Repository</label>
            <input
              className={styles.input}
              placeholder="owner/repo (e.g., mean-weasel/seatify)"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
            />
          </div>

          <div>
            <label className={styles.label}>Local path (optional)</label>
            <input
              className={styles.input}
              placeholder="~/Desktop/seatify"
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}
          {warning && <div className={styles.warning}>{warning}</div>}

          <Button variant="primary" disabled={submitting} className={styles.submitBtn} onClick={handleSubmit}>
            {submitting ? "Adding..." : "Add Repository"}
          </Button>
        </div>

        <p className={styles.hint}>
          Or run{" "}
          <code className={styles.inlineCode}>issuectl repo add owner/repo</code>{" "}
          from the CLI
        </p>
      </div>
    </div>
  );
}
