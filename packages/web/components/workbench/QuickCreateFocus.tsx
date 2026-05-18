"use client";

import { useMemo, useState } from "react";
import type { BatchCreateResult, ParsedIssue, ParsedIssuesResponse, Priority } from "@issuectl/core";
import type { WorkbenchPayload } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type CandidateIssue = {
  id: string;
  title: string;
  body: string;
  owner: string;
  repo: string;
  labels: string[];
  accepted: boolean;
  originalText: string;
};

type DraftState = {
  id: string | null;
  title: string;
  body: string;
  priority: Priority;
  labels: string;
};

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
  const [result, setResult] = useState<BatchCreateResult | null>(null);
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
      const response = await requestJson<BatchCreateResult>("/api/v1/parse/create", {
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

      {cards.length > 0 && (
        <section aria-label="Candidate issues" className={styles.quickCreateCandidates}>
          {cards.map((card, index) => (
            <article
              key={card.id}
              aria-label={`Candidate issue ${index + 1}`}
              data-state={card.accepted ? "accepted" : "rejected"}
              className={styles.quickCreateCard}
            >
              <div className={`${styles.quickCreateRow} ${styles.quickCreateSplitRow}`}>
                <strong>{card.accepted ? "accepted" : "rejected"}</strong>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => updateCard(card.id, { accepted: !card.accepted })}
                >
                  {card.accepted ? "Reject" : "Accept"}
                </button>
              </div>
              <label className={styles.workbenchField}>
                Title
                <input
                  aria-label={`Candidate ${index + 1} title`}
                  className={styles.workbenchInput}
                  value={card.title}
                  onChange={(event) => updateCard(card.id, { title: event.target.value })}
                />
              </label>
              <label className={styles.workbenchField}>
                Repository
                <select
                  aria-label={`Candidate ${index + 1} repository`}
                  className={styles.workbenchInput}
                  value={card.owner && card.repo ? `${card.owner}/${card.repo}` : ""}
                  onChange={(event) => {
                    const [owner = "", repo = ""] = event.target.value.split("/");
                    updateCard(card.id, { owner, repo });
                  }}
                >
                  <option value="">Save as draft</option>
                  {repoOptions.map((repo) => (
                    <option key={repo.key} value={repo.key}>
                      {repo.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.workbenchField}>
                Body
                <textarea
                  aria-label={`Candidate ${index + 1} body`}
                  className={`${styles.workbenchInput} ${styles.quickCreateCandidateBody}`}
                  value={card.body}
                  onChange={(event) => updateCard(card.id, { body: event.target.value })}
                />
              </label>
              {card.originalText && <p className={styles.muted}>{card.originalText}</p>}
            </article>
          ))}
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleCreateAccepted}
            disabled={acceptedCount === 0 || parseStatus !== "idle"}
          >
            {parseStatus === "creating" ? "Creating..." : "Create accepted issues"}
          </button>
        </section>
      )}

      {result && (
        <section aria-label="Quick create results" className={styles.quickCreateCard}>
          <strong>
            {result.created} created, {result.drafted} drafted, {result.failed} failed
          </strong>
          {result.results.map((item) => (
            <div key={item.id} className={styles.quickCreateRow}>
              <span>{item.success ? "created" : "failed"}</span>
              <span>{item.owner && item.repo ? `${item.owner}/${item.repo}` : "draft"}</span>
              {item.issueNumber ? <span>#{item.issueNumber}</span> : null}
              {item.draftId ? <span>draft {item.draftId}</span> : null}
              {item.error ? <span role="alert">{item.error}</span> : null}
            </div>
          ))}
        </section>
      )}

      <section aria-label="Draft fallback" className={styles.quickCreateCard}>
        <div>
          <h2>Draft fallback</h2>
          <p className={styles.muted}>Save unclear work locally, revise it, then assign it to the selected repo.</p>
        </div>
        <label className={styles.workbenchField}>
          Draft title
          <input
            aria-label="Draft title"
            className={styles.workbenchInput}
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          />
        </label>
        <label className={styles.workbenchField}>
          Draft body
          <textarea
            aria-label="Draft body"
            className={`${styles.workbenchInput} ${styles.quickCreateDraftBody}`}
            value={draft.body}
            onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
          />
        </label>
        <label className={styles.workbenchField}>
          Priority
          <select
            aria-label="Draft priority"
            className={styles.workbenchInput}
            value={draft.priority}
            onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as Priority }))}
          >
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="high">high</option>
          </select>
        </label>
        <label className={styles.workbenchField}>
          Assign labels
          <input
            aria-label="Draft labels"
            className={styles.workbenchInput}
            value={draft.labels}
            onChange={(event) => setDraft((current) => ({ ...current, labels: event.target.value }))}
            placeholder="bug, workbench"
          />
        </label>
        <div className={styles.quickCreateRow}>
          <button type="button" className={styles.primaryButton} onClick={handleSaveDraft} disabled={!draft.title.trim()}>
            Save draft
          </button>
          <button type="button" className={styles.secondaryButton} onClick={handleUpdateDraft} disabled={!draft.id}>
            Update draft
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleAssignDraft}
            disabled={!draft.id || !selectedRepo}
          >
            Assign draft
          </button>
        </div>
        {draftMessage && <p role="status">{draftMessage}</p>}
      </section>

      {error && <p role="alert" className={styles.issueFocusError}>{error}</p>}
    </div>
  );

  function updateCard(id: string, patch: Partial<CandidateIssue>) {
    setCards((current) => current.map((card) => card.id === id ? { ...card, ...patch } : card));
  }
}

function toCandidateIssues(parsed: ParsedIssuesResponse, defaultRepoKey: string): CandidateIssue[] {
  const order = new Map(parsed.suggestedOrder.map((id, index) => [id, index]));
  return [...parsed.issues]
    .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
    .map((issue) => toCandidateIssue(issue, defaultRepoKey));
}

function toCandidateIssue(issue: ParsedIssue, defaultRepoKey: string): CandidateIssue {
  const [defaultOwner = "", defaultRepo = ""] = defaultRepoKey.split("/");
  return {
    id: issue.id,
    title: issue.title,
    body: issue.body,
    owner: issue.repoOwner ?? defaultOwner,
    repo: issue.repoName ?? defaultRepo,
    labels: issue.suggestedLabels,
    accepted: true,
    originalText: issue.originalText,
  };
}

function repoKey(repo: WorkbenchPayload["repos"][number] | null | undefined): string | null {
  return repo ? `${repo.owner}/${repo.name}` : null;
}

function unwrapParsedResponse(body: { parsed: ParsedIssuesResponse } | ParsedIssuesResponse): ParsedIssuesResponse {
  return "parsed" in body ? body.parsed : body;
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const token = readApiToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(path, { ...init, headers });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    throw new Error(
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed with ${response.status}`,
    );
  }
  return body as T;
}

function readApiToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("issuectl.apiToken")
    ?? window.localStorage.getItem("issuectlApiToken");
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
