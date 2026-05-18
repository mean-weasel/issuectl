import type { Priority } from "@issuectl/core";
import type { CandidateIssue, DraftState, QuickCreateResult, RepoOption } from "./quick-create-data";
import type { WorkbenchPayload } from "./workbench-types";
import styles from "./WorkbenchShell.module.css";

type CandidateIssuesProps = {
  cards: CandidateIssue[];
  repoOptions: RepoOption[];
  acceptedCount: number;
  parseStatus: "idle" | "parsing" | "creating";
  onUpdateCard: (id: string, patch: Partial<CandidateIssue>) => void;
  onCreateAccepted: () => void;
};

type DraftFallbackProps = {
  draft: DraftState;
  draftMessage: string | null;
  selectedRepo: WorkbenchPayload["repos"][number] | null;
  onDraftChange: (patch: Partial<DraftState>) => void;
  onSaveDraft: () => void;
  onUpdateDraft: () => void;
  onAssignDraft: () => void;
};

export function CandidateIssuesSection({
  cards,
  repoOptions,
  acceptedCount,
  parseStatus,
  onUpdateCard,
  onCreateAccepted,
}: CandidateIssuesProps) {
  if (cards.length === 0) return null;

  return (
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
              onClick={() => onUpdateCard(card.id, { accepted: !card.accepted })}
            >
              {card.accepted ? "Reject" : "Accept"}
            </button>
          </div>
          <CandidateFields card={card} index={index} repoOptions={repoOptions} onUpdateCard={onUpdateCard} />
        </article>
      ))}
      <button
        type="button"
        className={styles.primaryButton}
        onClick={onCreateAccepted}
        disabled={acceptedCount === 0 || parseStatus !== "idle"}
      >
        {parseStatus === "creating" ? "Creating..." : "Create accepted issues"}
      </button>
    </section>
  );
}

export function QuickCreateResults({ result }: { result: QuickCreateResult | null }) {
  if (!result) return null;

  return (
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
  );
}

export function DraftFallback({
  draft,
  draftMessage,
  selectedRepo,
  onDraftChange,
  onSaveDraft,
  onUpdateDraft,
  onAssignDraft,
}: DraftFallbackProps) {
  return (
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
          onChange={(event) => onDraftChange({ title: event.target.value })}
        />
      </label>
      <label className={styles.workbenchField}>
        Draft body
        <textarea
          aria-label="Draft body"
          className={`${styles.workbenchInput} ${styles.quickCreateDraftBody}`}
          value={draft.body}
          onChange={(event) => onDraftChange({ body: event.target.value })}
        />
      </label>
      <label className={styles.workbenchField}>
        Priority
        <select
          aria-label="Draft priority"
          className={styles.workbenchInput}
          value={draft.priority}
          onChange={(event) => onDraftChange({ priority: event.target.value as Priority })}
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
          onChange={(event) => onDraftChange({ labels: event.target.value })}
          placeholder="bug, workbench"
        />
      </label>
      <div className={styles.quickCreateRow}>
        <button type="button" className={styles.primaryButton} onClick={onSaveDraft} disabled={!draft.title.trim()}>
          Save draft
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onUpdateDraft} disabled={!draft.id}>
          Update draft
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onAssignDraft} disabled={!draft.id || !selectedRepo}>
          Assign draft
        </button>
      </div>
      {draftMessage && <p role="status">{draftMessage}</p>}
    </section>
  );
}

function CandidateFields({
  card,
  index,
  repoOptions,
  onUpdateCard,
}: {
  card: CandidateIssue;
  index: number;
  repoOptions: RepoOption[];
  onUpdateCard: (id: string, patch: Partial<CandidateIssue>) => void;
}) {
  return (
    <>
      <label className={styles.workbenchField}>
        Title
        <input
          aria-label={`Candidate ${index + 1} title`}
          className={styles.workbenchInput}
          value={card.title}
          onChange={(event) => onUpdateCard(card.id, { title: event.target.value })}
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
            onUpdateCard(card.id, { owner, repo });
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
          onChange={(event) => onUpdateCard(card.id, { body: event.target.value })}
        />
      </label>
      {card.originalText && <p className={styles.muted}>{card.originalText}</p>}
    </>
  );
}
