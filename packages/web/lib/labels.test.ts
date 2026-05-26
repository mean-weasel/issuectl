import { describe, expect, it } from "vitest";
import { isLifecycleLabel, isSelectableIssueLabel } from "./labels";

describe("label helpers", () => {
  it("treats issuectl labels as lifecycle labels", () => {
    expect(isLifecycleLabel("issuectl:auto-launch")).toBe(true);
    expect(isLifecycleLabel("bug")).toBe(false);
  });

  it("allows issue creation to select auto-launch but not runtime labels", () => {
    expect(isSelectableIssueLabel("issuectl:auto-launch")).toBe(true);
    expect(isSelectableIssueLabel("issuectl:deployed")).toBe(false);
    expect(isSelectableIssueLabel("issuectl:in-progress")).toBe(false);
    expect(isSelectableIssueLabel("bug")).toBe(true);
  });
});
