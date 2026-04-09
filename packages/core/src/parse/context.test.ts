import { describe, it, expect } from "vitest";
import { formatRepoContext } from "./context.js";

describe("formatRepoContext", () => {
  it("formats multiple repos with labels", () => {
    const result = formatRepoContext([
      { owner: "acme", name: "api", labels: ["bug", "feature", "P0"] },
      { owner: "acme", name: "web", labels: ["frontend", "backend"] },
    ]);

    expect(result).toContain("## Connected Repositories");
    expect(result).toContain("### acme/api");
    expect(result).toContain("- Owner: acme");
    expect(result).toContain("- Repo: api");
    expect(result).toContain("- Available labels: bug, feature, P0");
    expect(result).toContain("### acme/web");
    expect(result).toContain("- Available labels: frontend, backend");
  });

  it("handles empty repo list", () => {
    const result = formatRepoContext([]);

    expect(result).toContain("No repositories are connected");
    expect(result).not.toContain("###");
  });

  it("handles repos with no labels", () => {
    const result = formatRepoContext([
      { owner: "acme", name: "empty", labels: [] },
    ]);

    expect(result).toContain("### acme/empty");
    expect(result).toContain("- Available labels: (none)");
  });

  it("formats single repo correctly", () => {
    const result = formatRepoContext([
      { owner: "mean-weasel", name: "issuectl", labels: ["bug"] },
    ]);

    expect(result).toContain("### mean-weasel/issuectl");
    expect(result).toContain("- Owner: mean-weasel");
    expect(result).toContain("- Repo: issuectl");
    expect(result).toContain("- Available labels: bug");
  });
});
