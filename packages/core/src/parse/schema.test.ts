import { describe, it, expect } from "vitest";
import { PARSED_ISSUES_SCHEMA } from "./schema.js";

describe("PARSED_ISSUES_SCHEMA", () => {
  it("requires issues and suggestedOrder at top level", () => {
    expect(PARSED_ISSUES_SCHEMA.required).toContain("issues");
    expect(PARSED_ISSUES_SCHEMA.required).toContain("suggestedOrder");
  });

  it("defines issues as an array", () => {
    expect(PARSED_ISSUES_SCHEMA.properties.issues.type).toBe("array");
  });

  it("defines suggestedOrder as an array of strings", () => {
    expect(PARSED_ISSUES_SCHEMA.properties.suggestedOrder.type).toBe("array");
    expect(PARSED_ISSUES_SCHEMA.properties.suggestedOrder.items.type).toBe("string");
  });

  it("issue items have all required fields", () => {
    const itemSchema = PARSED_ISSUES_SCHEMA.properties.issues.items;
    const required = itemSchema.required;

    expect(required).toContain("id");
    expect(required).toContain("originalText");
    expect(required).toContain("title");
    expect(required).toContain("body");
    expect(required).toContain("type");
    expect(required).toContain("repoOwner");
    expect(required).toContain("repoName");
    expect(required).toContain("repoConfidence");
    expect(required).toContain("suggestedLabels");
    expect(required).toContain("clarity");
  });

  it("type enum matches ParsedIssueType values", () => {
    const typeEnum = PARSED_ISSUES_SCHEMA.properties.issues.items.properties.type.enum;

    expect(typeEnum).toEqual([
      "bug",
      "feature",
      "enhancement",
      "refactor",
      "docs",
      "chore",
    ]);
  });

  it("clarity enum matches ParsedIssueClarity values", () => {
    const clarityEnum = PARSED_ISSUES_SCHEMA.properties.issues.items.properties.clarity.enum;

    expect(clarityEnum).toEqual(["clear", "ambiguous", "unknown_repo"]);
  });

  it("repoOwner and repoName allow null", () => {
    const props = PARSED_ISSUES_SCHEMA.properties.issues.items.properties;

    expect(props.repoOwner.type).toContain("null");
    expect(props.repoName.type).toContain("null");
  });

  it("repoConfidence has min 0 and max 1", () => {
    const conf = PARSED_ISSUES_SCHEMA.properties.issues.items.properties.repoConfidence;

    expect(conf.minimum).toBe(0);
    expect(conf.maximum).toBe(1);
  });
});
