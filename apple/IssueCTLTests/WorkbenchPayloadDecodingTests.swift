import XCTest
@testable import IssueCTL

final class WorkbenchPayloadDecodingTests: XCTestCase {
    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    func testDecodesAggregateWorkbenchPayload() throws {
        let payload = try decoder.decode(WorkbenchPayload.self, from: Self.fixtureData)

        XCTAssertEqual(payload.generatedAt, "2026-05-16T15:45:00.000Z")
        XCTAssertEqual(payload.settings["terminal_backend"], "pty_bridge")
        XCTAssertEqual(payload.health.version, "1.2.3")
        XCTAssertEqual(payload.user.login, "jeremy")

        let repo = try XCTUnwrap(payload.repos.first)
        XCTAssertEqual(repo.fullName, "neonwatty/issuectl")
        XCTAssertEqual(repo.webhookPayloadMode, .metadata)
        XCTAssertEqual(repo.terminalBackendDefault, .ptyBridge)
        XCTAssertEqual(repo.issues.count, 2)
        XCTAssertEqual(repo.issues[0].priority, .high)
        XCTAssertEqual(repo.issues[0].labels, ["bug", "urgent"])
        XCTAssertTrue(repo.issues[0].hasActiveDeployment)
        XCTAssertEqual(repo.priorities[0].priority, .high)
        XCTAssertEqual(repo.previews["7703"]?.status, .error)
        XCTAssertEqual(repo.webhookEvents[0].eventType, "pull_request")
        XCTAssertEqual(repo.webhookEvents[0].targetType, .pr)
        XCTAssertEqual(repo.prReviews[0].reviewedFromSha, "head-a")
        XCTAssertEqual(repo.prReviews[0].reviewedToSha, "head-b")

        let activeIssueDeployment = try XCTUnwrap(repo.deployments.first)
        XCTAssertEqual(activeIssueDeployment.issueNumber, 12)
        XCTAssertEqual(activeIssueDeployment.targetType, .issue)
        XCTAssertEqual(activeIssueDeployment.targetNumber, 12)
        XCTAssertEqual(activeIssueDeployment.terminalBackend, .ptyBridge)
        XCTAssertTrue(activeIssueDeployment.isActive)

        let prCompletion = try XCTUnwrap(repo.recentCompletions.first)
        XCTAssertEqual(prCompletion.issueNumber, 44)
        XCTAssertEqual(prCompletion.targetType, .pr)
        XCTAssertEqual(prCompletion.targetNumber, 44)
        XCTAssertEqual(prCompletion.terminalReason, "completed")
        XCTAssertEqual(prCompletion.completionResultJson, "{\"summary\":\"review complete\"}")
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
          "badge_count": 1,
          "deployed_count": 1,
          "launch_agent": "codex",
          "terminal_backend_default": "pty_bridge",
          "issue_error": null,
          "issues_from_cache": true,
          "issues_cached_at": "2026-05-16T15:30:00.000Z",
          "priorities": [
            {"repo_id": 1, "issue_number": 12, "priority": "high", "updated_at": 1779000000}
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
            }
          ],
          "recent_completions": [
            {
              "id": 201,
              "repo_id": 1,
              "issue_number": null,
              "target_type": "pr",
              "target_number": 44,
              "agent": "codex",
              "branch_name": "review-pr-44",
              "workspace_mode": "worktree",
              "workspace_path": "/workspace/issuectl-pr-44",
              "linked_pr_number": null,
              "state": "active",
              "terminal_backend": "ttyd",
              "triggered_by": "webhook",
              "parent_deployment_id": null,
              "webhook_depth": 0,
              "launched_at": "2026-05-16T14:10:00.000Z",
              "ended_at": "2026-05-16T14:30:00.000Z",
              "terminal_reason": "completed",
              "completion_token": "token-201",
              "completion_result_json": "{\\"summary\\":\\"review complete\\"}",
              "notification_sent_at": null,
              "ttyd_port": 7704,
              "ttyd_pid": 1235,
              "idle_since": null,
              "owner": "neonwatty",
              "repo_name": "issuectl"
            }
          ],
          "webhook_events": [
            {
              "id": 7,
              "delivery_id": "delivery-7",
              "event_type": "pull_request",
              "action": "synchronize",
              "sender_login": "jeremy",
              "target_type": "pr",
              "target_number": 44,
              "received_at": 1779000001,
              "intent_id": 8
            }
          ],
          "pr_reviews": [
            {
              "id": 9,
              "repo_id": 1,
              "pr_number": 44,
              "deployment_id": 201,
              "started_head_sha": "head-a",
              "completed_head_sha": "head-b",
              "review_base_sha": "base-a",
              "reviewed_from_sha": "head-a",
              "reviewed_to_sha": "head-b",
              "head_repo_full_name": "neonwatty/issuectl",
              "head_ref": "feature",
              "status": "completed",
              "triggered_by": "webhook",
              "result_json": "{\\"ok\\":true}",
              "started_at": 1779000002,
              "completed_at": 1779000003
            }
          ],
          "previews": {
            "7703": {
              "lines": ["error preview"],
              "last_updated_ms": 1779000000000,
              "last_changed_ms": 1779000000000,
              "status": "error"
            }
          },
          "issues": [
            {
              "number": 12,
              "title": "Port workbench",
              "state": "open",
              "labels": ["bug", "urgent"],
              "updated_at": "2026-05-16T15:30:00.000Z",
              "priority": "high",
              "has_active_deployment": true,
              "html_url": "https://github.com/neonwatty/issuectl/issues/12",
              "author_login": "jeremy"
            },
            {
              "number": 13,
              "title": "Keep summary partial",
              "state": "open",
              "labels": [],
              "updated_at": "2026-05-16T15:31:00.000Z",
              "priority": "normal",
              "has_active_deployment": false,
              "html_url": "https://github.com/neonwatty/issuectl/issues/13",
              "author_login": null
            }
          ]
        }
      ],
      "deployments": [],
      "previews": {},
      "settings": {
        "branch_pattern": "issue-{number}-{slug}",
        "terminal_backend": "pty_bridge"
      },
      "health": {
        "ok": true,
        "version": "1.2.3",
        "timestamp": "2026-05-16T15:44:00.000Z",
        "error": null
      },
      "user": {
        "login": "jeremy",
        "error": null
      },
      "generated_at": "2026-05-16T15:45:00.000Z"
    }
    """.data(using: .utf8)!
}
