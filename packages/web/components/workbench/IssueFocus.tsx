/* eslint-disable max-lines */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { LaunchAgent, Priority, WorkspaceMode } from "@issuectl/core";
import { AgentSelector } from "@/components/launch/AgentSelector";
import { BranchInput } from "@/components/launch/BranchInput";
import { ContextToggles } from "@/components/launch/ContextToggles";
import { PreambleInput } from "@/components/launch/PreambleInput";
import { WorkspaceModeSelector } from "@/components/launch/WorkspaceModeSelector";
import { BodyText } from "@/components/detail/BodyText";
import { generateBranchName } from "@/lib/branch";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import type { WorkbenchDeployment, WorkbenchIssueSummary, WorkbenchRepo } from "./workbench-types";
import type { WorkbenchSectionCollapseState, WorkbenchSectionId } from "./workbench-state";
import {
  addIssueComment,
  cleanupWorktrees,
  fetchIssueDetail,
  fetchWorktreeStatus,
  launchWorkbenchIssue,
  patchIssue,
  reassignIssue,
  resetIssueWorktree,
  setIssueAssignees,
  setIssuePriority,
  setIssueState,
  toggleIssueLabel,
  uploadIssueImage,
  type WorktreeStatusResult,
  type WorkbenchIssueDetail,
} from "./workbench-api";
import styles from "./WorkbenchShell.module.css";

type ReassignResult = { owner: string; repo: string; issueNumber: number };

type Props = {
  repo: WorkbenchRepo;
  issue: WorkbenchIssueSummary;
  reassignTargets: WorkbenchRepo[];
  currentUserLogin: string | null;
  collapsedSections: WorkbenchSectionCollapseState;
  sessionsHidden: boolean;
  hasHiddenSessions: boolean;
  onToggleSection: (section: WorkbenchSectionId) => void;
  onShowSessions: () => void;
  onIssueUpdated: (issueNumber: number, patch: Partial<WorkbenchIssueSummary>) => void;
  onIssueReassigned: (result: ReassignResult) => void;
  onSessionLaunched: (deployment: WorkbenchDeployment) => void;
  onJumpToSession: (deploymentId: number) => void;
};

export function IssueFocus({
  repo,
  issue,
  reassignTargets,
  currentUserLogin,
  collapsedSections,
  sessionsHidden,
  hasHiddenSessions,
  onToggleSection,
  onShowSessions,
  onIssueUpdated,
  onIssueReassigned,
  onSessionLaunched,
  onJumpToSession,
}: Props) {
  const [detail, setDetail] = useState<WorkbenchIssueDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [titleDraft, setTitleDraft] = useState(issue.title);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [reassignedIssue, setReassignedIssue] = useState<ReassignResult | null>(null);
  const actionAlertRef = useRef<HTMLParagraphElement | null>(null);
  const [agent, setAgent] = useState<LaunchAgent>("codex");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() => defaultWorkspaceMode(repo));
  const [branchName, setBranchName] = useState(() => defaultBranchName(repo, issue));
  const [selectedComments, setSelectedComments] = useState<number[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [preamble, setPreamble] = useState("Investigate workbench implementation");
  const [forceResume, setForceResume] = useState(false);
  const [worktreeStatus, setWorktreeStatus] = useState<WorktreeStatusResult | null>(null);
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);
  const [reassignTargetKey, setReassignTargetKey] = useState("");
  const ref = useMemo(
    () => ({ owner: repo.owner, repo: repo.name, issueNumber: issue.number }),
    [repo.name, repo.owner, issue.number],
  );

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    setDetail(null);
    fetchIssueDetail(ref)
      .then((nextDetail) => {
        if (cancelled) return;
        setDetail(nextDetail);
        setTitleDraft(nextDetail.issue.title);
        setStatus("loaded");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Issue detail failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [ref]);

  useEffect(() => {
    setBranchName(defaultBranchName(repo, issue));
    setSelectedComments([]);
    setSelectedFiles([]);
    setPreamble("Investigate workbench implementation");
    setForceResume(false);
    setWorktreeStatus(null);
    setLaunchMessage(null);
    setActionMessage(null);
    setComment("");
    setTitleDraft(issue.title);
    setImageFile(null);
    setWorkspaceMode(defaultWorkspaceMode(repo));
    setReassignedIssue(null);
    setReassignTargetKey("");
  }, [issue.number, repo.localPath, repo.name, repo.owner]);

  useEffect(() => {
    if (!detail) return;
    setSelectedComments(detail.comments.map((_, index) => index));
    setSelectedFiles(detail.referencedFiles);
  }, [detail?.comments, detail?.issue.number, detail?.referencedFiles]);

  useEffect(() => {
    if (error && status !== "error") {
      actionAlertRef.current?.focus();
    }
  }, [error, status]);

  useEffect(() => {
    let cancelled = false;
    fetchWorktreeStatus(ref)
      .then((nextStatus) => {
        if (!cancelled) setWorktreeStatus(nextStatus);
      })
      .catch(() => {
        if (!cancelled) setWorktreeStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ref, workspaceMode]);

  const loadedIssue = detail?.issue;
  const title = loadedIssue?.title ?? issue.title;
  const titleChanged = titleDraft.trim().length > 0 && titleDraft.trim() !== title;
  const priority = issue.priority;
  const state = loadedIssue?.state ?? issue.state;
  const comments = detail?.comments ?? [];
  const referencedFiles = detail?.referencedFiles ?? [];
  const activeDeployments = detail?.deployments.filter(isActiveDeployment) ?? [];
  const historicalDeployments = detail?.deployments.filter((deployment) => !isActiveDeployment(deployment)) ?? [];
  const selectedReassignTarget = reassignTargets.find(
    (target) => reassignKey(target) === reassignTargetKey,
  ) ?? null;

  if (reassignedIssue) {
    return (
      <div className={styles.issueFocus}>
        <header className={styles.issueFocusHeader}>
          <p className={styles.kicker}>Issue details</p>
          <h1>#{reassignedIssue.issueNumber} Reassigned issue #{reassignedIssue.issueNumber}</h1>
          <div className={styles.issueFocusMeta}>
            <span>{reassignedIssue.owner}/{reassignedIssue.repo}</span>
            <span>open</span>
          </div>
        </header>
      </div>
    );
  }

  async function runAction(name: string, action: () => Promise<void>): Promise<void> {
    setPendingAction(name);
    setError(null);
    setActionMessage(null);
    try {
      await action();
      if (name !== "launch") setActionMessage(actionSuccessMessage(name));
    } catch (err) {
      const message = `${name} failed: ${err instanceof Error ? err.message : "request failed"}`;
      setError(message);
      if (name === "launch") setLaunchMessage(message);
    } finally {
      setPendingAction(null);
    }
  }

  function updateLoadedIssue(patch: Partial<WorkbenchIssueDetail["issue"]>): void {
    setDetail((current) => current ? { ...current, issue: { ...current.issue, ...patch } } : current);
  }

  return (
    <div className={styles.issueFocus}>
      <header className={styles.issueFocusHeader}>
        <p className={styles.kicker}>Issue details</p>
        <h1>#{issue.number} {title}</h1>
        <div className={styles.issueFocusMeta}>
          <span>{repo.owner}/{repo.name}</span>
          <span>{state}</span>
          <span>{priority}</span>
          {detail?.fromCache && <span>Cached</span>}
        </div>
        {loadedIssue?.labels.length ? (
          <div className={styles.issueLabels} aria-label="Issue labels">
            {loadedIssue.labels.map((label) => (
              <span key={label.name}>{label.name}</span>
            ))}
          </div>
        ) : null}
        {sessionsHidden && hasHiddenSessions && (
          <button type="button" className={styles.sessionRevealButton} onClick={onShowSessions}>
            Sessions hidden · Show sessions
          </button>
        )}
      </header>

      {status === "loading" && <p className={styles.issueFocusNotice}>Loading issue #{issue.number}</p>}
      {status === "error" && (
        <p className={styles.issueFocusError} role="alert">
          Issue detail failed to load: {error}
        </p>
      )}
      {actionMessage && <p className={styles.issueFocusNotice} role="status">{actionMessage}</p>}

      <section className={styles.issueFocusBody} aria-label="Issue body">
        <BodyText body={loadedIssue?.body ?? issue.title} />
      </section>

      <div className={styles.issueDetailSections}>
        <CollapsibleSection
          id={`issue-${issue.number}-linked-prs`}
          title={`Linked PRs ${detail?.linkedPRs.length ?? 0}`}
          controlLabel="Toggle linked PRs section"
          bodyLabel="Issue detail metadata"
          collapsed={collapsedSections.issueLinkedPrs}
          section="issueLinkedPrs"
          onToggle={onToggleSection}
        >
          <section className={styles.issueFocusGrid}>
            <div>
              <h2>Linked PRs</h2>
              {detail?.linkedPRs.length ? detail.linkedPRs.map((pull) => (
                <a key={pull.number} href={pull.htmlUrl} target="_blank" rel="noreferrer">
                  #{pull.number} {pull.title}
                </a>
              )) : <p>No linked PRs</p>}
            </div>
            <div>
              <h2>Active sessions</h2>
              {activeDeployments.length ? (
                <div className={styles.deploymentList}>
                  {activeDeployments.map((deployment) => (
                    <DeploymentRow
                      key={deployment.id}
                      deployment={deployment}
                      active
                      canJump={repo.deployments.some((item) => item.id === deployment.id)}
                      onJumpToSession={onJumpToSession}
                    />
                  ))}
                </div>
              ) : <p>No active sessions</p>}
              <h2>History</h2>
              {historicalDeployments.length ? (
                <div className={styles.deploymentList}>
                  {historicalDeployments.map((deployment) => (
                    <DeploymentRow
                      key={deployment.id}
                      deployment={deployment}
                      active={false}
                      canJump={false}
                      onJumpToSession={onJumpToSession}
                    />
                  ))}
                </div>
              ) : <p>No deployment history</p>}
            </div>
          </section>
        </CollapsibleSection>

        <CollapsibleSection
          id={`issue-${issue.number}-comments`}
          title={`Comments ${comments.length}`}
          controlLabel="Toggle comments section"
          bodyLabel="Issue comments"
          collapsed={collapsedSections.issueComments}
          section="issueComments"
          onToggle={onToggleSection}
        >
          {comments.length ? comments.map((item) => (
            <p key={item.id}>{item.user?.login ?? "unknown"}: {item.body}</p>
          )) : <p>No comments</p>}
        </CollapsibleSection>
      </div>

      <section className={styles.issueActionGrid} aria-label="Issue actions">
        {error && status !== "error" && (
          <p ref={actionAlertRef} className={styles.issueFocusError} role="alert" tabIndex={-1}>
            {error}
          </p>
        )}
        <div className={styles.issueActionGroup} aria-label="Metadata actions">
          <h2>Metadata</h2>
          <label>
            Priority
            <select
              value={priority}
              disabled={pendingAction !== null}
              onChange={(event) => {
                const nextPriority = event.currentTarget.value as Priority;
                void runAction("priority", async () => {
                  await setIssuePriority(ref, nextPriority);
                  onIssueUpdated(issue.number, { priority: nextPriority });
                });
              }}
            >
              <option value="high">high</option>
              <option value="normal">normal</option>
              <option value="low">low</option>
            </select>
          </label>
          <label>
            Issue title
            <input
              value={titleDraft}
              disabled={pendingAction !== null || status !== "loaded"}
              onChange={(event) => setTitleDraft(event.currentTarget.value)}
            />
          </label>
          <button
            type="button"
            disabled={pendingAction !== null || status !== "loaded" || !titleChanged}
            onClick={() => void runAction("edit issue", async () => {
              const nextTitle = titleDraft.trim();
              await patchIssue(ref, { title: nextTitle });
              updateLoadedIssue({ title: nextTitle });
              onIssueUpdated(issue.number, { title: nextTitle });
            })}
          >
            Save title
          </button>
        </div>

        <div className={styles.issueActionGroup} aria-label="Comment actions">
          <h2>Comment</h2>
          <label>
            Comment
            <textarea
              placeholder="Add a comment..."
              value={comment}
              onChange={(event) => setComment(event.currentTarget.value)}
            />
          </label>
          <button
            type="button"
            disabled={pendingAction !== null || comment.trim().length === 0}
            onClick={() => void runAction("comment", async () => {
              await addIssueComment(ref, comment);
              setComment("");
            })}
          >
            Add comment
          </button>
        </div>

        <details className={styles.issueActionGroup}>
          <summary>State and labels</summary>
          <button
            type="button"
            disabled={pendingAction !== null}
            onClick={() => void runAction("state", async () => {
              const nextState = state === "closed" ? "open" : "closed";
              await setIssueState(ref, nextState, nextState === "closed" ? "Closing from workbench" : undefined);
              updateLoadedIssue({ state: nextState });
              onIssueUpdated(issue.number, { state: nextState });
            })}
          >
            {state === "closed" ? "Reopen issue" : "Close issue"}
          </button>
          <button
            type="button"
            disabled={pendingAction !== null}
            onClick={() => void runAction("labels", async () => {
              await toggleIssueLabel(ref, "workbench", "add");
              updateLoadedIssue({
                labels: loadedIssue?.labels.some((label) => label.name === "workbench")
                  ? loadedIssue.labels
                  : [...(loadedIssue?.labels ?? []), { name: "workbench", color: "ffffff", description: null }],
              });
            })}
          >
            Add label
          </button>
          <button
            type="button"
            disabled={pendingAction !== null || !currentUserLogin}
            onClick={() => void runAction("assignees", async () => {
              if (!currentUserLogin) return;
              await setIssueAssignees(ref, [currentUserLogin]);
            })}
          >
            Assign me
          </button>
        </details>

        <details className={styles.issueActionGroup}>
          <summary>Reassign and attachments</summary>
          <label>
            Reassign target
            <select
              value={reassignTargetKey}
              disabled={pendingAction !== null || reassignTargets.length === 0}
              onChange={(event) => setReassignTargetKey(event.currentTarget.value)}
            >
              <option value="">Choose repo...</option>
              {reassignTargets.map((target) => (
                <option key={reassignKey(target)} value={reassignKey(target)}>
                  {target.owner}/{target.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pendingAction !== null || !selectedReassignTarget}
            onClick={() => void runAction("reassign", async () => {
              if (!selectedReassignTarget) return;
              const result = await reassignIssue(ref, selectedReassignTarget.owner, selectedReassignTarget.name);
              const reassigned = {
                owner: result.newOwner,
                repo: result.newRepo,
                issueNumber: result.newIssueNumber,
              };
              setReassignedIssue(reassigned);
              onIssueReassigned(reassigned);
            })}
          >
            Reassign
          </button>
          <label>
            Image
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setImageFile(event.currentTarget.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            disabled={pendingAction !== null || !imageFile}
            onClick={() => void runAction("attach image", async () => {
              if (!imageFile) return;
              await uploadIssueImage(repo.owner, repo.name, imageFile);
            })}
          >
            Attach image
          </button>
        </details>
      </section>

      <div className={styles.issueDetailSections}>
        <CollapsibleSection
          id={`issue-${issue.number}-context`}
          title={`Context ${comments.length + referencedFiles.length}`}
          controlLabel="Toggle context section"
          bodyLabel="Issue context"
          collapsed={collapsedSections.issueContext}
          section="issueContext"
          onToggle={onToggleSection}
        >
          <ContextToggles
            comments={comments}
            referencedFiles={referencedFiles}
            selectedComments={selectedComments}
            selectedFiles={selectedFiles}
            onToggleComment={(index) => setSelectedComments((current) => toggleValue(current, index))}
            onToggleFile={(path) => setSelectedFiles((current) => toggleValue(current, path))}
            onAddFile={(path) => setSelectedFiles((current) => [...current, path])}
          />
          <PreambleInput value={preamble} onChange={setPreamble} agent={agent} />
        </CollapsibleSection>

        <CollapsibleSection
          id={`issue-${issue.number}-launch-options`}
          title="Launch options"
          controlLabel="Toggle launch section"
          bodyLabel="Launch options"
          collapsed={collapsedSections.issueLaunchOptions}
          section="issueLaunchOptions"
          onToggle={onToggleSection}
        >
          <section className={styles.issueFocusGrid}>
            <div>
              <h2>Launch options</h2>
              <BranchInput value={branchName} onChange={setBranchName} />
              <AgentSelector value={agent} onChange={setAgent} disabled={pendingAction !== null} />
              <WorkspaceModeSelector
                value={workspaceMode}
                onChange={setWorkspaceMode}
                repoLocalPath={repo.localPath}
                repo={repo.name}
                issueNumber={issue.number}
              />
            </div>
            <div>
              <h2>Worktree</h2>
              <p>
                {worktreeStatus
                  ? `${worktreeStatus.exists ? "exists" : "missing"} · ${worktreeStatus.dirty ? "dirty" : "clean"}`
                  : "Status unavailable"}
              </p>
              {worktreeStatus?.dirty && !forceResume && (
                <div role="alert">
                  <p>Dirty worktree warning</p>
                  <button
                    type="button"
                    disabled={pendingAction !== null}
                    onClick={() => void runAction("reset worktree", async () => {
                      await resetIssueWorktree(ref);
                      setWorktreeStatus({ ...worktreeStatus, dirty: false });
                    })}
                  >
                    Reset worktree
                  </button>
                  <button type="button" onClick={() => setForceResume(true)}>
                    Resume with changes
                  </button>
                </div>
              )}
              <button
                type="button"
                disabled={pendingAction !== null}
                onClick={() => void runAction("cleanup worktrees", async () => {
                  await cleanupWorktrees();
                })}
              >
                Cleanup stale
              </button>
              <button
                type="button"
                disabled={pendingAction !== null}
                onClick={() => void runAction("launch", async () => {
                  const result = await launchWorkbenchIssue(ref, {
                    agent,
                    branchName,
                    workspaceMode,
                    selectedCommentIndices: selectedComments,
                    selectedFilePaths: selectedFiles,
                    preamble,
                    forceResume,
                    idempotencyKey: newIdempotencyKey(),
                  });
                  if (!result.success || result.deploymentId === undefined || result.ttydPort === undefined) {
                    setLaunchMessage(result.error ?? "Launch failed");
                    return;
                  }
                  const deployment = deploymentFromLaunch({
                    repo,
                    issue,
                    agent,
                    branchName,
                    workspaceMode,
                    deploymentId: result.deploymentId,
                    ttydPort: result.ttydPort,
                  });
                  setLaunchMessage("Launch started");
                  onSessionLaunched(deployment);
                })}
              >
                Launch issue
              </button>
              {launchMessage && <p>{launchMessage}</p>}
            </div>
          </section>
        </CollapsibleSection>
      </div>
    </div>
  );
}

function DeploymentRow({
  deployment,
  active,
  canJump,
  onJumpToSession,
}: {
  deployment: WorkbenchDeployment;
  active: boolean;
  canJump: boolean;
  onJumpToSession: (deploymentId: number) => void;
}) {
  return (
    <article className={styles.deploymentRow} data-status={active ? "active" : "history"}>
      <div>
        <strong>{active ? "Active session" : "Historical deployment"}</strong>
        <span>Deployment {deployment.id} · {deployment.branchName}</span>
        <span>{deploymentStatusLabel(deployment)}</span>
      </div>
      {active && canJump && (
        <button type="button" onClick={() => onJumpToSession(deployment.id)}>
          Jump to session
        </button>
      )}
    </article>
  );
}

function isActiveDeployment(deployment: WorkbenchDeployment): boolean {
  return deployment.state === "active" && deployment.endedAt === null;
}

function deploymentStatusLabel(deployment: WorkbenchDeployment): string {
  if (isActiveDeployment(deployment)) return "running";
  if (deployment.endedAt) return `ended ${formatDateTime(deployment.endedAt)}`;
  return deployment.state;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actionSuccessMessage(name: string): string {
  switch (name) {
    case "edit issue":
      return "Title saved";
    case "comment":
      return "Comment added";
    case "priority":
      return "Priority updated";
    case "labels":
      return "Label updated";
    case "assignees":
      return "Assignees updated";
    case "state":
      return "Issue state updated";
    case "attach image":
      return "Image attached";
    default:
      return `${name} saved`;
  }
}

function CollapsibleSection({
  id,
  title,
  controlLabel,
  bodyLabel,
  collapsed,
  section,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  controlLabel: string;
  bodyLabel: string;
  collapsed: boolean;
  section: WorkbenchSectionId;
  onToggle: (section: WorkbenchSectionId) => void;
  children: ReactNode;
}) {
  return (
    <section className={styles.collapsibleSection}>
      <button
        type="button"
        className={styles.collapsibleHeader}
        aria-expanded={!collapsed}
        aria-controls={id}
        aria-label={controlLabel}
        onClick={() => onToggle(section)}
      >
        <span>{title}</span>
        <span aria-hidden="true">v</span>
      </button>
      <div id={id} className={styles.collapsibleBody} aria-label={bodyLabel} hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}

function defaultBranchName(repo: WorkbenchRepo, issue: WorkbenchIssueSummary): string {
  return generateBranchName(repo.branchPattern ?? "issue-{number}-{slug}", issue.number, issue.title);
}

function defaultWorkspaceMode(repo: WorkbenchRepo): WorkspaceMode {
  return repo.localPath ? "worktree" : "clone";
}

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function reassignKey(repo: WorkbenchRepo): string {
  return `${repo.owner}/${repo.name}`;
}

function deploymentFromLaunch({
  repo,
  issue,
  agent,
  branchName,
  workspaceMode,
  deploymentId,
  ttydPort,
}: {
  repo: WorkbenchRepo;
  issue: WorkbenchIssueSummary;
  agent: LaunchAgent;
  branchName: string;
  workspaceMode: WorkspaceMode;
  deploymentId: number;
  ttydPort: number;
}): WorkbenchDeployment {
  return {
    id: deploymentId,
    repoId: repo.id,
    issueNumber: issue.number,
    agent,
    branchName,
    workspaceMode,
    workspacePath: repo.localPath ?? "",
    linkedPrNumber: null,
    state: "active",
    launchedAt: new Date().toISOString(),
    endedAt: null,
    ttydPort,
    ttydPid: null,
    idleSince: null,
    owner: repo.owner,
    repoName: repo.name,
  };
}
