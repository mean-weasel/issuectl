"use server";

import {
  getDb,
  getRepo,
  listRepos,
  listLabels,
  createIssue as coreCreateIssue,
  createDraft,
  clearCacheKey,
  parseIssues,
  formatRepoContext,
  withAuthRetry,
  formatErrorForUser,
  mapLimit,
  DEFAULT_REPO_FANOUT,
} from "@issuectl/core";
import type {
  ParsedIssuesResponse,
  ReviewedIssue,
  BatchCreateResult,
} from "@issuectl/core";
import { revalidateSafely } from "@/lib/revalidate";
import { notifyNewIssue } from "@/lib/push/notifications";

// Parse input is a free-form prompt that gets piped to the Claude CLI;
// cost and latency are proportional to token count and the content is
// never persisted, so the cap is much tighter than draft/issue body
// limits (65536). 8K is generous for the "describe what you want" use
// case and prevents a paste-bomb from burning the LLM budget.
const MAX_PARSE_INPUT = 8192;
const MAX_BATCH_SIZE = 25;
const MAX_TITLE = 256;

type ParseActionResult =
  | { success: true; data: { parsed: ParsedIssuesResponse } }
  | { success: false; error: string };

export async function parseNaturalLanguage(
  input: string,
): Promise<ParseActionResult> {
  if (typeof input !== "string") {
    return { success: false, error: "Input must be a string" };
  }
  if (!input.trim()) {
    return { success: false, error: "Input cannot be empty" };
  }
  if (input.length > MAX_PARSE_INPUT) {
    return {
      success: false,
      error: `Input must be ${MAX_PARSE_INPUT} characters or fewer`,
    };
  }

  try {
    const db = getDb();
    const dbRepos = listRepos(db);

    if (dbRepos.length === 0) {
      return {
        success: false,
        error: "No repositories connected. Add repos in Settings first.",
      };
    }

    const labelResults = await withAuthRetry((octokit) =>
      mapLimit(dbRepos, DEFAULT_REPO_FANOUT, async (r) => {
        try {
          const labels = await listLabels(octokit, r.owner, r.name);
          return { owner: r.owner, name: r.name, labels: labels.map((l) => l.name) };
        } catch (err) {
          console.warn(
            `[issuectl] Failed to fetch labels for ${r.owner}/${r.name}:`,
            err instanceof Error ? err.message : err,
          );
          return { owner: r.owner, name: r.name, labels: [] as string[] };
        }
      }),
    );

    const contextPrompt = formatRepoContext(labelResults);
    const result = await parseIssues(input, contextPrompt);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: { parsed: result.data } };
  } catch (err) {
    console.error("[issuectl] Failed to parse natural language:", err);
    return {
      success: false,
      error: `Failed to parse input: ${formatErrorForUser(err)}`,
    };
  }
}

export async function batchCreateIssues(
  issues: ReviewedIssue[],
): Promise<BatchCreateResult> {
  const accepted = issues.filter((i) => i.accepted);

  if (accepted.length === 0) {
    return { created: 0, drafted: 0, failed: 0, results: [] };
  }

  if (accepted.length > MAX_BATCH_SIZE) {
    return {
      created: 0,
      drafted: 0,
      failed: accepted.length,
      results: accepted.map((issue) => ({
        id: issue.id,
        success: false as const,
        error: `Too many issues (${accepted.length}). Maximum ${MAX_BATCH_SIZE} at a time.`,
        owner: issue.owner,
        repo: issue.repo,
      })),
    };
  }

  try {
    const db = getDb();

    const results = await mapLimit(accepted, 3, async (issue) => {
      if (!issue.title.trim()) {
        return {
          id: issue.id,
          success: false as const,
          error: "Title is required",
          owner: issue.owner,
          repo: issue.repo,
        };
      }

      if (issue.title.trim().length > MAX_TITLE) {
        return {
          id: issue.id,
          success: false as const,
          error: `Title must be ${MAX_TITLE} characters or fewer`,
          owner: issue.owner,
          repo: issue.repo,
        };
      }

      // No repo selected — save as a local draft instead
      if (!issue.owner || !issue.repo) {
        try {
          const draft = createDraft(db, {
            title: issue.title.trim(),
            body: issue.body.trim() || undefined,
          });
          return {
            id: issue.id,
            success: true as const,
            draftId: draft.id,
            owner: "",
            repo: "",
          };
        } catch (err) {
          console.error(
            `[issuectl] Failed to save draft "${issue.title}":`,
            err,
          );
          return {
            id: issue.id,
            success: false as const,
            error: "Failed to save draft locally. Please try again.",
            owner: "",
            repo: "",
          };
        }
      }

      if (!getRepo(db, issue.owner, issue.repo)) {
        return {
          id: issue.id,
          success: false as const,
          error: `Repository not tracked: ${issue.owner}/${issue.repo}`,
          owner: issue.owner,
          repo: issue.repo,
        };
      }

      try {
        const created = await withAuthRetry((octokit) =>
          coreCreateIssue(octokit, issue.owner, issue.repo, {
            title: issue.title.trim(),
            body: issue.body.trim() || undefined,
            labels: issue.labels.length > 0 ? issue.labels : undefined,
          }),
        );

        clearCacheKey(db, `issues:${issue.owner}/${issue.repo}`);
        notifyNewIssue({
          owner: issue.owner,
          repo: issue.repo,
          issueNumber: created.number,
          title: issue.title.trim(),
        });

        return {
          id: issue.id,
          success: true as const,
          issueNumber: created.number,
          owner: issue.owner,
          repo: issue.repo,
        };
      } catch (err) {
        console.error(
          `[issuectl] Failed to create issue "${issue.title}":`,
          err,
        );
        return {
          id: issue.id,
          success: false as const,
          error: formatErrorForUser(err),
          owner: issue.owner,
          repo: issue.repo,
        };
      }
    });

    revalidateSafely("/");

    return {
      created: results.filter((r) => r.success && r.issueNumber).length,
      drafted: results.filter((r) => r.success && r.draftId).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  } catch (err) {
    console.error("[issuectl] Failed to batch create issues:", err);
    const errorMsg = formatErrorForUser(err);
    return {
      created: 0,
      drafted: 0,
      failed: accepted.length,
      results: accepted.map((issue) => ({
        id: issue.id,
        success: false as const,
        error: errorMsg,
        owner: issue.owner,
        repo: issue.repo,
      })),
    };
  }
}
