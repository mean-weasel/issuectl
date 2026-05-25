import type { Octokit } from "@octokit/rest";

export const ISSUECTL_WEBHOOK_EVENTS = [
  "issues",
  "issue_comment",
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
  "push",
];

export type GitHubWebhookSetupInput = {
  owner: string;
  repo: string;
  url: string;
  secret: string;
};

export type GitHubWebhookSetupResult = {
  id: number;
  createdBy: string;
};

export async function createIssuectlWebhook(
  octokit: Octokit,
  input: GitHubWebhookSetupInput,
): Promise<GitHubWebhookSetupResult> {
  const createdBy = await getAuthenticatedLogin(octokit);
  const { data } = await octokit.rest.repos.createWebhook({
    owner: input.owner,
    repo: input.repo,
    name: "web",
    active: true,
    events: ISSUECTL_WEBHOOK_EVENTS,
    config: webhookConfig(input),
  });
  return { id: data.id, createdBy };
}

export async function rotateIssuectlWebhook(
  octokit: Octokit,
  input: GitHubWebhookSetupInput & { hookId: number },
): Promise<GitHubWebhookSetupResult> {
  const createdBy = await getAuthenticatedLogin(octokit);
  const { data } = await octokit.rest.repos.updateWebhook({
    owner: input.owner,
    repo: input.repo,
    hook_id: input.hookId,
    active: true,
    events: ISSUECTL_WEBHOOK_EVENTS,
    config: webhookConfig(input),
  });
  return { id: data.id, createdBy };
}

function webhookConfig(input: GitHubWebhookSetupInput) {
  return {
    url: input.url,
    content_type: "json",
    secret: input.secret,
    insecure_ssl: "0",
  };
}

async function getAuthenticatedLogin(octokit: Octokit): Promise<string> {
  const { data } = await octokit.rest.users.getAuthenticated();
  return data.login;
}
