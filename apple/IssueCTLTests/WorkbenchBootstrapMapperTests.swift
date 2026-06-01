import XCTest
@testable import IssueCTL

final class WorkbenchBootstrapMapperTests: XCTestCase {
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    func testIndexesIssueSummariesByRepoAndIssueKey() throws {
        let bootstrap = try WorkbenchBootstrap(payload: decodePayload())

        XCTAssertEqual(bootstrap.issueSummariesByRepo["neonwatty/issuectl"]?.map(\.number), [12, 13])
        XCTAssertEqual(bootstrap.issueSummariesByRepo["neonwatty/other"]?.map(\.number), [12])

        let issuectlKey = WorkbenchIssueKey(owner: "neonwatty", repo: "issuectl", number: 12)
        let otherKey = WorkbenchIssueKey(owner: "neonwatty", repo: "other", number: 12)

        XCTAssertEqual(bootstrap.issueSummary(for: issuectlKey)?.title, "Port workbench")
        XCTAssertEqual(bootstrap.issueSummary(for: otherKey)?.title, "Same number, different repo")
        XCTAssertNotEqual(bootstrap.issueSummary(for: issuectlKey)?.htmlUrl, bootstrap.issueSummary(for: otherKey)?.htmlUrl)
    }

    func testIndexesOnlyActiveIssueDeployments() throws {
        let bootstrap = try WorkbenchBootstrap(payload: decodePayload())

        let activeIssueKey = WorkbenchIssueKey(owner: "neonwatty", repo: "issuectl", number: 12)
        let inactiveIssueKey = WorkbenchIssueKey(owner: "neonwatty", repo: "issuectl", number: 13)
        let prNumberKey = WorkbenchIssueKey(owner: "neonwatty", repo: "issuectl", number: 44)

        XCTAssertEqual(bootstrap.activeIssueDeployment(for: activeIssueKey)?.id, 101)
        XCTAssertNil(bootstrap.activeIssueDeployment(for: inactiveIssueKey))
        XCTAssertNil(bootstrap.activeIssueDeployment(for: prNumberKey))
    }

    func testPriorityProjectionUsesRepoPriorityRowsAndDefaultsToNormal() throws {
        let bootstrap = try WorkbenchBootstrap(payload: decodePayload())

        XCTAssertEqual(bootstrap.priority(for: WorkbenchIssueKey(owner: "neonwatty", repo: "issuectl", number: 12)), .high)
        XCTAssertEqual(bootstrap.priority(for: WorkbenchIssueKey(owner: "neonwatty", repo: "issuectl", number: 13)), .low)
        XCTAssertEqual(bootstrap.priority(for: WorkbenchIssueKey(owner: "neonwatty", repo: "missing", number: 99)), .normal)
    }

    func testProjectsIssueCacheFreshnessFromWorkbenchRepos() throws {
        let bootstrap = try WorkbenchBootstrap(payload: decodePayload())

        XCTAssertTrue(bootstrap.usesCachedIssues)
        XCTAssertEqual(
            bootstrap.issueCachedDates.map { sharedISO8601Formatter.string(from: $0) },
            ["2026-05-16T15:30:00.000Z"]
        )
    }

    private func decodePayload() throws -> WorkbenchPayload {
        try decoder.decode(WorkbenchPayload.self, from: Self.fixtureData)
    }

    private static let fixtureData = """
    {
      "repos": [
        {
          "id": 1,
          "owner": "neonwatty",
          "name": "issuectl",
          "local_path": "/workspace/issuectl",
          "branch_pattern": null,
          "auto_launch_issues": true,
          "auto_review_prs": true,
          "issue_agent": "codex",
          "review_agent": "claude",
          "webhook_id": 123,
          "webhook_payload_mode": "metadata",
          "badge_count": 2,
          "deployed_count": 2,
          "launch_agent": "codex",
          "terminal_backend_default": "pty_bridge",
          "issue_error": null,
          "issues_from_cache": true,
          "issues_cached_at": "2026-05-16T15:30:00.000Z",
          "priorities": [
            {"repo_id": 1, "issue_number": 12, "priority": "high", "updated_at": 1779000000},
            {"repo_id": 1, "issue_number": 13, "priority": "low", "updated_at": 1779000001}
          ],
          "deployments": [
            {
              "id": 101,
              "repo_id": 1,
              "issue_number": 12,
              "target_type": "issue",
              "target_number": 12,
              "agent": "codex",
              "branch_name": "issue-12",
              "workspace_mode": "worktree",
              "workspace_path": "/workspace/issuectl",
              "linked_pr_number": null,
              "state": "active",
              "terminal_backend": "pty_bridge",
              "triggered_by": "manual",
              "parent_deployment_id": null,
              "webhook_depth": 0,
              "launched_at": "2026-05-16T15:10:00.000Z",
              "ended_at": null,
              "terminal_reason": null,
              "completion_token": null,
              "completion_result_json": null,
              "notification_sent_at": null,
              "ttyd_port": 7703,
              "ttyd_pid": 1234,
              "idle_since": null,
              "owner": "neonwatty",
              "repo_name": "issuectl"
            },
            {
              "id": 102,
              "repo_id": 1,
              "issue_number": 13,
              "target_type": "issue",
              "target_number": 13,
              "agent": "codex",
              "branch_name": "issue-13",
              "workspace_mode": "worktree",
              "workspace_path": "/workspace/issuectl-ended",
              "linked_pr_number": null,
              "state": "active",
              "terminal_backend": "ttyd",
              "triggered_by": "manual",
              "parent_deployment_id": null,
              "webhook_depth": 0,
              "launched_at": "2026-05-16T14:10:00.000Z",
              "ended_at": "2026-05-16T14:20:00.000Z",
              "terminal_reason": "completed",
              "completion_token": null,
              "completion_result_json": null,
              "notification_sent_at": null,
              "ttyd_port": 7704,
              "ttyd_pid": 1235,
              "idle_since": null,
              "owner": "neonwatty",
              "repo_name": "issuectl"
            },
            {
              "id": 103,
              "repo_id": 1,
              "issue_number": null,
              "target_type": "pr",
              "target_number": 44,
              "agent": "codex",
              "branch_name": "review-pr-44",
              "workspace_mode": "worktree",
              "workspace_path": "/workspace/issuectl-pr",
              "linked_pr_number": null,
              "state": "active",
              "terminal_backend": "ttyd",
              "triggered_by": "webhook",
              "parent_deployment_id": null,
              "webhook_depth": 0,
              "launched_at": "2026-05-16T13:10:00.000Z",
              "ended_at": null,
              "terminal_reason": null,
              "completion_token": null,
              "completion_result_json": null,
              "notification_sent_at": null,
              "ttyd_port": 7705,
              "ttyd_pid": 1236,
              "idle_since": null,
              "owner": "neonwatty",
              "repo_name": "issuectl"
            }
          ],
          "recent_completions": [],
          "webhook_events": [],
          "pr_reviews": [],
          "previews": {},
          "issues": [
            {
              "number": 12,
              "title": "Port workbench",
              "state": "open",
              "labels": ["bug"],
              "updated_at": "2026-05-16T15:30:00.000Z",
              "priority": "normal",
              "has_active_deployment": true,
              "html_url": "https://github.com/neonwatty/issuectl/issues/12",
              "author_login": "jeremy"
            },
            {
              "number": 13,
              "title": "No active deployment",
              "state": "open",
              "labels": [],
              "updated_at": "2026-05-16T15:31:00.000Z",
              "priority": "normal",
              "has_active_deployment": false,
              "html_url": "https://github.com/neonwatty/issuectl/issues/13",
              "author_login": null
            }
          ]
        },
        {
          "id": 2,
          "owner": "neonwatty",
          "name": "other",
          "local_path": "/workspace/other",
          "branch_pattern": null,
          "auto_launch_issues": false,
          "auto_review_prs": false,
          "issue_agent": "claude",
          "review_agent": "claude",
          "webhook_id": null,
          "webhook_payload_mode": "metadata",
          "badge_count": 0,
          "deployed_count": 0,
          "launch_agent": null,
          "terminal_backend_default": "ttyd",
          "issue_error": null,
          "issues_from_cache": false,
          "issues_cached_at": null,
          "priorities": [],
          "deployments": [],
          "recent_completions": [],
          "webhook_events": [],
          "pr_reviews": [],
          "previews": {},
          "issues": [
            {
              "number": 12,
              "title": "Same number, different repo",
              "state": "open",
              "labels": [],
              "updated_at": "2026-05-16T15:32:00.000Z",
              "priority": "normal",
              "has_active_deployment": false,
              "html_url": "https://github.com/neonwatty/other/issues/12",
              "author_login": "jeremy"
            }
          ]
        }
      ],
      "deployments": [],
      "previews": {},
      "settings": {},
      "health": {"ok": true, "version": "1.2.3", "timestamp": null, "error": null},
      "user": {"login": null, "error": null},
      "generated_at": "2026-05-16T15:45:00.000Z"
    }
    """.data(using: .utf8)!
}
