"use server";

import { revalidatePath } from "next/cache";
import {
  getDb,
  getOctokit,
  listRepos,
  listLabels,
  createIssue as coreCreateIssue,
  clearCacheKey,
  parseIssues,
  formatRepoContext,
} from "@issuectl/core";
import type {
  ParsedIssuesResponse,
  ReviewedIssue,
  BatchCreateResult,
  GitHubLabel,
} from "@issuectl/core";

type ParseActionResult = {
  success: boolean;
  data?: { parsed: ParsedIssuesResponse };
  error?: string;
};

export async function parseNaturalLanguage(
  input: string,
): Promise<ParseActionResult> {
  if (!input.trim()) {
    return { success: false, error: "Input cannot be empty" };
  }

  try {
    const db = getDb();
    const octokit = await getOctokit();
    const dbRepos = listRepos(db);

    if (dbRepos.length === 0) {
      return {
        success: false,
        error: "No repositories connected. Add repos in Settings first.",
      };
    }

    const labelResults = await Promise.all(
      dbRepos.map(async (r) => {
        try {
          const labels = await listLabels(octokit, r.owner, r.name);
          return { owner: r.owner, name: r.name, labels: labels.map((l) => l.name) };
        } catch {
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
    return { success: false, error: "Failed to parse input" };
  }
}

export async function batchCreateIssues(
  issues: ReviewedIssue[],
): Promise<BatchCreateResult> {
  const accepted = issues.filter((i) => i.accepted);

  if (accepted.length === 0) {
    return { created: 0, failed: 0, results: [] };
  }

  const db = getDb();
  const octokit = await getOctokit();

  const results = await Promise.all(
    accepted.map(async (issue) => {
      try {
        const created = await coreCreateIssue(octokit, issue.owner, issue.repo, {
          title: issue.title.trim(),
          body: issue.body.trim() || undefined,
          labels: issue.labels.length > 0 ? issue.labels : undefined,
        });

        clearCacheKey(db, `issues:${issue.owner}/${issue.repo}`);

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
          error: err instanceof Error ? err.message : "Unknown error",
          owner: issue.owner,
          repo: issue.repo,
        };
      }
    }),
  );

  const affectedRepos = new Set(
    results
      .filter((r) => r.success)
      .map((r) => `/${r.owner}/${r.repo}`),
  );
  for (const repoPath of affectedRepos) {
    revalidatePath(repoPath);
  }

  return {
    created: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}
