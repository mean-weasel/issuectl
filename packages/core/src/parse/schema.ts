export const PARSED_ISSUES_SCHEMA = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Unique identifier for this issue (UUID format)",
          },
          originalText: {
            type: "string",
            description: "The portion of the original input this issue came from",
          },
          title: {
            type: "string",
            description: "Clean, actionable GitHub issue title",
          },
          body: {
            type: "string",
            description:
              "Full GitHub-quality markdown issue body with appropriate sections",
          },
          type: {
            type: "string",
            enum: [
              "bug",
              "feature",
              "enhancement",
              "refactor",
              "docs",
              "chore",
            ],
            description: "Issue type category",
          },
          repoOwner: {
            type: ["string", "null"],
            description:
              "GitHub repo owner matched from connected repos, or null if unknown",
          },
          repoName: {
            type: ["string", "null"],
            description:
              "GitHub repo name matched from connected repos, or null if unknown",
          },
          repoConfidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "Confidence score for repo match (0-1)",
          },
          suggestedLabels: {
            type: "array",
            items: { type: "string" },
            description:
              "Labels suggested from the matched repo's available label set",
          },
          clarity: {
            type: "string",
            enum: ["clear", "ambiguous", "unknown_repo"],
            description: "How confident the parsing is",
          },
        },
        required: [
          "id",
          "originalText",
          "title",
          "body",
          "type",
          "repoOwner",
          "repoName",
          "repoConfidence",
          "suggestedLabels",
          "clarity",
        ],
      },
    },
    suggestedOrder: {
      type: "array",
      items: { type: "string" },
      description: "Issue IDs in recommended creation order",
    },
  },
  required: ["issues", "suggestedOrder"],
} as const;
