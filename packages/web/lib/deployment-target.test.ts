import { describe, expect, it } from "vitest";

import {
  deploymentSessionName,
  getDeploymentTarget,
  issueNumberForDiagnostic,
} from "./deployment-target";

describe("deployment-target helpers", () => {
  it("falls back to legacy issueNumber fields for issue deployments", () => {
    expect(getDeploymentTarget({ issueNumber: 42 })).toEqual({
      targetType: "issue",
      targetNumber: 42,
    });
    expect(issueNumberForDiagnostic({ issueNumber: 42 })).toBe(42);
    expect(deploymentSessionName("api", { issueNumber: 42 })).toBe("issuectl-api-42");
  });

  it("prefers explicit targetNumber over legacy issueNumber", () => {
    expect(getDeploymentTarget({
      issueNumber: 7,
      targetType: "issue",
      targetNumber: 99,
    })).toEqual({
      targetType: "issue",
      targetNumber: 99,
    });
    expect(issueNumberForDiagnostic({
      issueNumber: 7,
      targetType: "issue",
      targetNumber: 99,
    })).toBe(99);
  });

  it("keeps pull request targets out of issue-scoped diagnostics", () => {
    const deployment = {
      issueNumber: 17,
      targetType: "pr" as const,
      targetNumber: 23,
    };

    expect(getDeploymentTarget(deployment)).toEqual({
      targetType: "pr",
      targetNumber: 23,
    });
    expect(issueNumberForDiagnostic(deployment)).toBeUndefined();
    expect(deploymentSessionName("mobile.app", deployment)).toBe("issuectl-mobile_app-pr-23");
  });

  it("does not infer pull request targets from legacy issue numbers", () => {
    const deployment = {
      issueNumber: 17,
      targetType: "pr" as const,
      targetNumber: null,
    };

    expect(() => getDeploymentTarget(deployment)).toThrow("Deployment target is missing");
    expect(issueNumberForDiagnostic(deployment)).toBeUndefined();
    expect(() => deploymentSessionName("api", deployment)).toThrow("Deployment target is missing");
  });

  it("rejects missing or invalid target numbers", () => {
    expect(() => getDeploymentTarget({})).toThrow("Deployment target is missing");
    expect(() => getDeploymentTarget({ issueNumber: 0 })).toThrow("Deployment target is missing");
    expect(() => getDeploymentTarget({ targetType: "pr", targetNumber: 1.5 })).toThrow(
      "Deployment target is missing",
    );
  });
});
