"use client";

import { useMemo, useState, type CSSProperties } from "react";
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

const panelStyle = {
  display: "grid",
  gap: "16px",
  maxWidth: "920px",
} satisfies CSSProperties;

const fieldStyle = {
  display: "grid",
  gap: "7px",
  color: "var(--paper-ink-muted)",
  font: "700 10px var(--paper-mono)",
  textTransform: "uppercase",
} satisfies CSSProperties;

const inputStyle = {
  minHeight: "38px",
  padding: "8px 10px",
  border: "1px solid var(--paper-line)",
  borderRadius: "var(--paper-radius-sm)",
  background: "rgba(255, 255, 255, 0.28)",
  color: "var(--paper-ink)",
  font: "14px var(--paper-serif)",
  textTransform: "none",
} satisfies CSSProperties;

const textareaStyle = {
  ...inputStyle,
  minHeight: "132px",
  resize: "vertical",
} satisfies CSSProperties;

const cardStyle = {
  display: "grid",
  gap: "12px",
  padding: "14px",
  border: "1px solid var(--paper-line)",
  borderRadius: "var(--paper-radius-md)",
  background: "rgba(255, 255, 255, 0.22)",
} satisfies CSSProperties;

const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
} satisfies CSSProperties;

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
    <div className={styles.focusInner} style={panelStyle}>
      <div>
        <p className={styles.kicker}>Quick Create</p>
        <h1>Quick Create</h1>
        <p className={styles.muted}>
          Parse free-form notes into candidate issues, review the matches, then create accepted items or save a draft.
        </p>
      </div>

      <section aria-label="Parse issue text" style={cardStyle}>
        <label style={fieldStyle}>
          Parse text
          <textarea
            aria-label="Parse text"
            style={textareaStyle}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Fix login timeout in issuectl. Also add keyboard shortcuts to the workbench."
            disabled={parseStatus !== "idle"}
          />
        </label>
        <div style={rowStyle}>
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
        <section aria-label="Candidate issues" style={{ display: "grid", gap: "10px" }}>
          {cards.map((card, index) => (
            <article
              key={card.id}
              aria-label={`Candidate issue ${index + 1}`}
              data-state={card.accepted ? "accepted" : "rejected"}
              style={{
                ...cardStyle,
                opacity: card.accepted ? 1 : 0.64,
                borderColor: card.accepted ? "var(--paper-accent)" : "var(--paper-line)",
              }}
            >
              <div style={{ ...rowStyle, justifyContent: "space-between" }}>
                <strong>{card.accepted ? "accepted" : "rejected"}</strong>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => updateCard(card.id, { accepted: !card.accepted })}
                >
                  {card.accepted ? "Reject" : "Accept"}
                </button>
              </div>
              <label style={fieldStyle}>
                Title
                <input
                  aria-label={`Candidate ${index + 1} title`}
                  style={inputStyle}
                  value={card.title}
                  onChange={(event) => updateCard(card.id, { title: event.target.value })}
                />
              </label>
              <label style={fieldStyle}>
                Repository
                <select
                  aria-label={`Candidate ${index + 1} repository`}
                  style={inputStyle}
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
              <label style={fieldStyle}>
                Body
                <textarea
                  aria-label={`Candidate ${index + 1} body`}
                  style={{ ...textareaStyle, minHeight: "84px" }}
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
        <section aria-label="Quick create results" style={cardStyle}>
          <strong>
            {result.created} created, {result.drafted} drafted, {result.failed} failed
          </strong>
          {result.results.map((item) => (
            <div key={item.id} style={rowStyle}>
              <span>{item.success ? "created" : "failed"}</span>
              <span>{item.owner && item.repo ? `${item.owner}/${item.repo}` : "draft"}</span>
              {item.issueNumber ? <span>#{item.issueNumber}</span> : null}
              {item.draftId ? <span>draft {item.draftId}</span> : null}
              {item.error ? <span role="alert">{item.error}</span> : null}
            </div>
          ))}
        </section>
      )}

      <section aria-label="Draft fallback" style={cardStyle}>
        <div>
          <h2>Draft fallback</h2>
          <p className={styles.muted}>Save unclear work locally, revise it, then assign it to the selected repo.</p>
        </div>
        <label style={fieldStyle}>
          Draft title
          <input
            aria-label="Draft title"
            style={inputStyle}
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          />
        </label>
        <label style={fieldStyle}>
          Draft body
          <textarea
            aria-label="Draft body"
            style={{ ...textareaStyle, minHeight: "86px" }}
            value={draft.body}
            onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
          />
        </label>
        <label style={fieldStyle}>
          Priority
          <select
            aria-label="Draft priority"
            style={inputStyle}
            value={draft.priority}
            onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as Priority }))}
          >
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="high">high</option>
          </select>
        </label>
        <label style={fieldStyle}>
          Assign labels
          <input
            aria-label="Draft labels"
            style={inputStyle}
            value={draft.labels}
            onChange={(event) => setDraft((current) => ({ ...current, labels: event.target.value }))}
            placeholder="bug, workbench"
          />
        </label>
        <div style={rowStyle}>
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
