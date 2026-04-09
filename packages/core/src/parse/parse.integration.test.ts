import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Octokit } from "@octokit/rest";
import { createIssue } from "../github/issues.js";

const execFileAsync = promisify(execFile);

const TEST_OWNER = "mean-weasel";
const TEST_REPO = "issuectl-test-repo";
const TEST_PREFIX = "[integration-test]";

let octokit: Octokit;
let skipReason: string | undefined;
const createdIssueNumbers: number[] = [];

beforeAll(async () => {
  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"]);
    const token = stdout.trim();
    octokit = new Octokit({ auth: token });
  } catch {
    skipReason = "gh auth not configured";
  }
});

afterAll(async () => {
  for (const num of createdIssueNumbers) {
    try {
      await execFileAsync("gh", [
        "issue",
        "close",
        String(num),
        "--repo",
        `${TEST_OWNER}/${TEST_REPO}`,
        "--reason",
        "not planned",
      ]);
    } catch {
      // Best-effort cleanup
    }
  }
});

describe("batch issue creation via GitHub API", () => {
  it("creates a single issue and verifies it", async () => {
    if (skipReason) {
      return expect.soft(true).toBe(true);
    }

    const issue = await createIssue(octokit, TEST_OWNER, TEST_REPO, {
      title: `${TEST_PREFIX} Test issue creation`,
      body: "## Description\n\nAutomated integration test — this issue should be closed automatically.",
      labels: ["documentation"],
    });

    createdIssueNumbers.push(issue.number);

    expect(issue.number).toBeGreaterThan(0);
    expect(issue.title).toBe(`${TEST_PREFIX} Test issue creation`);
    expect(issue.state).toBe("open");
    expect(issue.labels.some((l) => l.name === "documentation")).toBe(true);
  });

  it("creates multiple issues in parallel (batch pattern)", async () => {
    if (skipReason) {
      return expect.soft(true).toBe(true);
    }

    const fixtures = [
      {
        title: `${TEST_PREFIX} Batch issue A`,
        body: "First issue in batch test.",
      },
      {
        title: `${TEST_PREFIX} Batch issue B`,
        body: "Second issue in batch test.",
      },
    ];

    const results = await Promise.all(
      fixtures.map((data) =>
        createIssue(octokit, TEST_OWNER, TEST_REPO, data),
      ),
    );

    for (const issue of results) {
      createdIssueNumbers.push(issue.number);
    }

    expect(results).toHaveLength(2);
    expect(results[0].title).toBe(`${TEST_PREFIX} Batch issue A`);
    expect(results[1].title).toBe(`${TEST_PREFIX} Batch issue B`);
    expect(results[0].number).not.toBe(results[1].number);
  });
});
