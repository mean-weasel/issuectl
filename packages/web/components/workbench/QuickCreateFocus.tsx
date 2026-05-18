"use client";

import { useMemo, useState } from "react";
import type { ParsedIssuesResponse } from "@issuectl/core";
import { CandidateIssuesSection, DraftFallback, QuickCreateResults } from "./QuickCreateSections";
import {
  errorMessage,
  repoKey,
  requestJson,
  toCandidateIssues,
  unwrapParsedResponse,
  type CandidateIssue,
  type DraftState,
  type QuickCreateResult,
} from "./quick-create-data";
import type { WorkbenchPayload } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type Props = {
  repos: WorkbenchPayload["repos"];
  selectedRepo: WorkbenchPayload["repos"][number] | null;
};

export function QuickCreateFocus({ repos, selectedRepo }: Props) {
  const defaultRepoKey = repoKey(selectedRepo) ?? repoKey(repos[0]) ?? "";
  const repoOptions = useMemo(() => repos.map((repo) => ({
    id: repo.id,
    key: `${repo.owner}/${repo.name}`,
    label: `${repo.owner}/${repo.name}`,
    owner: repo.owner,
    repo: repo.name,
  })), [repos]);
  const [input, setInput] = useState("");
  const [parseStatus, setParseStatus] = useState<"idle" | "parsing" | "creating">("idle");
  const [cards, setCards] = useState<CandidateIssue[]>([]);
  const [result, setResult] = useState<QuickCreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>({
    id: null,
    title: "",
    body: "",
    priority: "normal",
    labels: "",
  });
  const [draftMessage, setDraftMessage] = useState<string | null>(null);

  const acceptedCount = cards.filter((card) => card.accepted).length;

  async function handleParse() {
    setParseStatus("parsing");
    setError(null);
    setResult(null);
    try {
      const body = await requestJson<{ parsed: ParsedIssuesResponse } | ParsedIssuesResponse>("/api/v1/parse", {
        method: "POST",
        body: JSON.stringify({ input }),
      });
      const parsed = unwrapParsedResponse(body);
      setCards(toCandidateIssues(parsed, defaultRepoKey));
      if (parsed.issues.length === 0) {
        setError("No candidate issues were parsed.");
      }
    } catch (err) {
      setError(errorMessage(err, "Unable to parse input."));
    } finally {
      setParseStatus("idle");
    }
  }

  async function handleCreateAccepted() {
    setParseStatus("creating");
    setError(null);
    try {
      const response = await requestJson<QuickCreateResult>("/api/v1/parse/create", {
        method: "POST",
        body: JSON.stringify({
          issues: cards.map((card) => ({
            id: card.id,
            title: card.title,
            body: card.body,
            owner: card.owner,
            repo: card.repo,
            labels: card.labels,
            accepted: card.accepted,
          })),
        }),
      });
      setResult(response);
    } catch (err) {
      setError(errorMessage(err, "Unable to create accepted issues."));
    } finally {
      setParseStatus("idle");
    }
  }

  async function handleSaveDraft() {
    setDraftMessage(null);
    setError(null);
    try {
      const response = await requestJson<{ success?: boolean; id: string }>("/api/v1/drafts", {
        method: "POST",
        body: JSON.stringify({
          title: draft.title,
          body: draft.body || undefined,
          priority: draft.priority,
        }),
      });
      setDraft((current) => ({ ...current, id: response.id }));
      setDraftMessage("Draft saved");
    } catch (err) {
      setError(errorMessage(err, "Unable to save draft."));
    }
  }

  async function handleUpdateDraft() {
    if (!draft.id) return;
    setDraftMessage(null);
    setError(null);
    try {
      await requestJson(`/api/v1/drafts/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: draft.title,
          body: draft.body,
          priority: draft.priority,
        }),
      });
      setDraftMessage("Draft updated");
    } catch (err) {
      setError(errorMessage(err, "Unable to update draft."));
    }
  }

  async function handleAssignDraft() {
    if (!draft.id || !selectedRepo) return;
    setDraftMessage(null);
    setError(null);
    try {
      const labels = draft.labels
        .split(",")
        .map((label) => label.trim())
        .filter(Boolean);
      const response = await requestJson<{ success?: boolean; issueNumber?: number; issueUrl?: string }>(
        `/api/v1/drafts/${draft.id}/assign`,
        {
          method: "POST",
          body: JSON.stringify({
            repoId: selectedRepo.id,
            labels,
          }),
        },
      );
      setDraftMessage(
        response.issueNumber
          ? `Draft assigned to ${selectedRepo.owner}/${selectedRepo.name}#${response.issueNumber}`
          : "Draft assigned",
      );
    } catch (err) {
      setError(errorMessage(err, "Unable to assign draft."));
    }
  }

  return (
    <div className={`${styles.focusInner} ${styles.quickCreatePanel}`}>
      <div>
        <p className={styles.kicker}>Quick Create</p>
        <h1>Quick Create</h1>
        <p className={styles.muted}>
          Parse free-form notes into candidate issues, review the matches, then create accepted items or save a draft.
        </p>
      </div>

      <section aria-label="Parse issue text" className={styles.quickCreateCard}>
        <label className={styles.workbenchField}>
          Parse text
          <textarea
            aria-label="Parse text"
            className={`${styles.workbenchInput} ${styles.quickCreateParseInput}`}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Fix login timeout in issuectl. Also add keyboard shortcuts to the workbench."
            disabled={parseStatus !== "idle"}
          />
        </label>
        <div className={styles.quickCreateRow}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleParse}
            disabled={!input.trim() || parseStatus !== "idle"}
          >
            {parseStatus === "parsing" ? "Parsing..." : "Parse"}
          </button>
          <span className={styles.muted}>
            Default repo: {selectedRepo ? `${selectedRepo.owner}/${selectedRepo.name}` : "first tracked repo"}
          </span>
        </div>
      </section>

      <CandidateIssuesSection
        cards={cards}
        repoOptions={repoOptions}
        acceptedCount={acceptedCount}
        parseStatus={parseStatus}
        onUpdateCard={updateCard}
        onCreateAccepted={handleCreateAccepted}
      />
      <QuickCreateResults result={result} />
      <DraftFallback
        draft={draft}
        draftMessage={draftMessage}
        selectedRepo={selectedRepo}
        onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onSaveDraft={handleSaveDraft}
        onUpdateDraft={handleUpdateDraft}
        onAssignDraft={handleAssignDraft}
      />

      {error && <p role="alert" className={styles.issueFocusError}>{error}</p>}
    </div>
  );

  function updateCard(id: string, patch: Partial<CandidateIssue>) {
    setCards((current) => current.map((card) => card.id === id ? { ...card, ...patch } : card));
  }
}
