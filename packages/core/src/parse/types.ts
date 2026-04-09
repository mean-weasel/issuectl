export type ParsedIssueType = "bug" | "feature" | "enhancement" | "refactor" | "docs" | "chore";

export type ParsedIssueClarity = "clear" | "ambiguous" | "unknown_repo";

export type ParsedIssue = {
  id: string;
  originalText: string;
  title: string;
  body: string;
  type: ParsedIssueType;
  repoOwner: string | null;
  repoName: string | null;
  repoConfidence: number;
  suggestedLabels: string[];
  clarity: ParsedIssueClarity;
};

export type ParsedIssuesResponse = {
  issues: ParsedIssue[];
  suggestedOrder: string[];
};

export type ReviewedIssue = {
  id: string;
  title: string;
  body: string;
  owner: string;
  repo: string;
  labels: string[];
  accepted: boolean;
};

export type BatchCreateResult = {
  created: number;
  failed: number;
  results: Array<{
    id: string;
    success: boolean;
    issueNumber?: number;
    error?: string;
    owner: string;
    repo: string;
  }>;
};
