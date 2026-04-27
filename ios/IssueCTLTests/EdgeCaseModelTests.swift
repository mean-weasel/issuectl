import XCTest
@testable import IssueCTL

final class EdgeCaseModelTests: XCTestCase {

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    // MARK: - GitHubPull checksStatus Field

    func testPullWithChecksStatusNull() throws {
        let json = """
        {
            "number": 1, "title": "PR", "body": null,
            "state": "open", "merged": false, "user": null,
            "head_ref": "feat", "base_ref": "main",
            "additions": 0, "deletions": 0, "changed_files": 0,
            "created_at": "2026-04-01T00:00:00Z",
            "updated_at": "2026-04-01T00:00:00Z",
            "merged_at": null, "closed_at": null,
            "html_url": "https://example.com/1",
            "checks_status": null
        }
        """.data(using: .utf8)!

        let pull = try decoder.decode(GitHubPull.self, from: json)
        XCTAssertNil(pull.checksStatus)
    }

    func testPullWithChecksStatusSuccess() throws {
        let json = """
        {
            "number": 2, "title": "PR", "body": null,
            "state": "open", "merged": false, "user": null,
            "head_ref": "feat", "base_ref": "main",
            "additions": 10, "deletions": 5, "changed_files": 2,
            "created_at": "2026-04-01T00:00:00Z",
            "updated_at": "2026-04-01T00:00:00Z",
            "merged_at": null, "closed_at": null,
            "html_url": "https://example.com/2",
            "checks_status": "success"
        }
        """.data(using: .utf8)!

        let pull = try decoder.decode(GitHubPull.self, from: json)
        XCTAssertEqual(pull.checksStatus, "success")
    }

    func testPullWithChecksStatusFailure() throws {
        let json = """
        {
            "number": 3, "title": "PR", "body": null,
            "state": "open", "merged": false, "user": null,
            "head_ref": "feat", "base_ref": "main",
            "additions": 0, "deletions": 0, "changed_files": 0,
            "created_at": "2026-04-01T00:00:00Z",
            "updated_at": "2026-04-01T00:00:00Z",
            "merged_at": null, "closed_at": null,
            "html_url": "https://example.com/3",
            "checks_status": "failure"
        }
        """.data(using: .utf8)!

        let pull = try decoder.decode(GitHubPull.self, from: json)
        XCTAssertEqual(pull.checksStatus, "failure")
    }

    func testPullWithChecksStatusPending() throws {
        let json = """
        {
            "number": 4, "title": "PR", "body": null,
            "state": "open", "merged": false, "user": null,
            "head_ref": "feat", "base_ref": "main",
            "additions": 0, "deletions": 0, "changed_files": 0,
            "created_at": "2026-04-01T00:00:00Z",
            "updated_at": "2026-04-01T00:00:00Z",
            "merged_at": null, "closed_at": null,
            "html_url": "https://example.com/4",
            "checks_status": "pending"
        }
        """.data(using: .utf8)!

        let pull = try decoder.decode(GitHubPull.self, from: json)
        XCTAssertEqual(pull.checksStatus, "pending")
    }

    func testPullWithChecksStatusMissingKey() throws {
        // checksStatus is optional, so omitting the key entirely should work
        let json = """
        {
            "number": 5, "title": "PR", "body": null,
            "state": "open", "merged": false, "user": null,
            "head_ref": "feat", "base_ref": "main",
            "additions": 0, "deletions": 0, "changed_files": 0,
            "created_at": "2026-04-01T00:00:00Z",
            "updated_at": "2026-04-01T00:00:00Z",
            "merged_at": null, "closed_at": null,
            "html_url": "https://example.com/5"
        }
        """.data(using: .utf8)!

        let pull = try decoder.decode(GitHubPull.self, from: json)
        XCTAssertNil(pull.checksStatus)
    }

    // MARK: - ActiveDeployment with DeploymentState Enum

    func testActiveDeploymentWithActiveState() throws {
        let json = """
        {
            "id": 10, "repo_id": 1, "issue_number": 5,
            "branch_name": "issue-5-fix", "workspace_mode": "worktree",
            "workspace_path": "/tmp/wt", "linked_pr_number": 15,
            "state": "active",
            "launched_at": "2026-04-27T08:00:00Z", "ended_at": null,
            "ttyd_port": 7682, "ttyd_pid": 999,
            "owner": "org", "repo_name": "app"
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(ActiveDeployment.self, from: json)
        XCTAssertEqual(deployment.state, .active)
        XCTAssertEqual(deployment.workspaceMode, .worktree)
        XCTAssertEqual(deployment.linkedPrNumber, 15)
        XCTAssertEqual(deployment.repoFullName, "org/app")
    }

    func testActiveDeploymentWithEndedState() throws {
        let json = """
        {
            "id": 11, "repo_id": 1, "issue_number": 5,
            "branch_name": "issue-5-fix", "workspace_mode": "clone",
            "workspace_path": "/tmp/clone", "linked_pr_number": null,
            "state": "ended",
            "launched_at": "2026-04-27T08:00:00Z", "ended_at": "2026-04-27T10:00:00Z",
            "ttyd_port": null, "ttyd_pid": null,
            "owner": "org", "repo_name": "app"
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(ActiveDeployment.self, from: json)
        XCTAssertEqual(deployment.state, .ended)
        XCTAssertEqual(deployment.workspaceMode, .clone)
        XCTAssertNotNil(deployment.endedAt)
    }

    func testActiveDeploymentWithExistingMode() throws {
        let json = """
        {
            "id": 12, "repo_id": 1, "issue_number": 3,
            "branch_name": "issue-3-docs", "workspace_mode": "existing",
            "workspace_path": "/dev/project", "linked_pr_number": null,
            "state": "active",
            "launched_at": "2026-04-27T08:00:00Z", "ended_at": null,
            "ttyd_port": 7683, "ttyd_pid": 100,
            "owner": "neonwatty", "repo_name": "blog"
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(ActiveDeployment.self, from: json)
        XCTAssertEqual(deployment.workspaceMode, .existing)
        XCTAssertEqual(deployment.repoFullName, "neonwatty/blog")
    }

    // MARK: - LaunchRequestBody with WorkspaceMode Enum

    func testLaunchRequestBodyWorktreeEncoding() throws {
        let body = LaunchRequestBody(
            branchName: "issue-1-test",
            workspaceMode: .worktree,
            selectedCommentIndices: [0, 2],
            selectedFilePaths: ["src/main.ts"],
            preamble: "Fix the bug",
            forceResume: true,
            idempotencyKey: "abc-123"
        )
        let data = try JSONEncoder().encode(body)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        XCTAssertEqual(json?["branchName"] as? String, "issue-1-test")
        XCTAssertEqual(json?["workspaceMode"] as? String, "worktree")
        XCTAssertEqual(json?["selectedCommentIndices"] as? [Int], [0, 2])
        XCTAssertEqual(json?["selectedFilePaths"] as? [String], ["src/main.ts"])
        XCTAssertEqual(json?["preamble"] as? String, "Fix the bug")
        XCTAssertEqual(json?["forceResume"] as? Bool, true)
        XCTAssertEqual(json?["idempotencyKey"] as? String, "abc-123")
    }

    func testLaunchRequestBodyCloneEncoding() throws {
        let body = LaunchRequestBody(
            branchName: "issue-2-feat",
            workspaceMode: .clone,
            selectedCommentIndices: [],
            selectedFilePaths: [],
            preamble: nil,
            forceResume: nil,
            idempotencyKey: nil
        )
        let data = try JSONEncoder().encode(body)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        XCTAssertEqual(json?["workspaceMode"] as? String, "clone")
        XCTAssertTrue((json?["selectedCommentIndices"] as? [Int])?.isEmpty ?? false)
        XCTAssertTrue((json?["selectedFilePaths"] as? [String])?.isEmpty ?? false)
    }

    func testLaunchRequestBodyExistingEncoding() throws {
        let body = LaunchRequestBody(
            branchName: "issue-3-docs",
            workspaceMode: .existing,
            selectedCommentIndices: [0],
            selectedFilePaths: ["README.md", "docs/spec.md"],
            preamble: nil,
            forceResume: nil,
            idempotencyKey: nil
        )
        let data = try JSONEncoder().encode(body)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        XCTAssertEqual(json?["workspaceMode"] as? String, "existing")
        XCTAssertEqual(json?["selectedFilePaths"] as? [String], ["README.md", "docs/spec.md"])
    }

    // MARK: - Date Computed Properties

    func testDeploymentLaunchedDateParsing() throws {
        let json = """
        {
            "id": 1, "repo_id": 1, "issue_number": 1,
            "branch_name": "b", "workspace_mode": "worktree",
            "workspace_path": "/tmp", "linked_pr_number": null,
            "state": "active",
            "launched_at": "2026-04-27T12:30:00Z", "ended_at": null,
            "ttyd_port": 7682, "ttyd_pid": 100
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(Deployment.self, from: json)
        XCTAssertNotNil(deployment.launchedDate)

        // Verify parsed date components
        let calendar = Calendar(identifier: .gregorian)
        let components = calendar.dateComponents(in: TimeZone(identifier: "UTC")!, from: deployment.launchedDate!)
        XCTAssertEqual(components.year, 2026)
        XCTAssertEqual(components.month, 4)
        XCTAssertEqual(components.day, 27)
        XCTAssertEqual(components.hour, 12)
        XCTAssertEqual(components.minute, 30)
    }

    func testDeploymentRunningDurationFormat() throws {
        // Use a launched_at far enough in the past to produce a stable duration.
        // The runningDuration computes from now, so we create a deployment with a known launch time.
        let json = """
        {
            "id": 1, "repo_id": 1, "issue_number": 1,
            "branch_name": "b", "workspace_mode": "worktree",
            "workspace_path": "/tmp", "linked_pr_number": null,
            "state": "active",
            "launched_at": "2020-01-01T00:00:00Z", "ended_at": null,
            "ttyd_port": 7682, "ttyd_pid": 100
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(Deployment.self, from: json)
        // This was launched in 2020, so runningDuration should include hours
        XCTAssertFalse(deployment.runningDuration.isEmpty)
        XCTAssertTrue(deployment.runningDuration.contains("h"), "Duration for a multi-year-old deployment should show hours")
    }

    func testDeploymentRunningDurationMinutesOnly() throws {
        // Use a launched_at that is recent (within the last hour) to get minutes-only
        let recentISO = ISO8601DateFormatter().string(from: Date().addingTimeInterval(-300)) // 5 min ago
        let json = """
        {
            "id": 1, "repo_id": 1, "issue_number": 1,
            "branch_name": "b", "workspace_mode": "worktree",
            "workspace_path": "/tmp", "linked_pr_number": null,
            "state": "active",
            "launched_at": "\(recentISO)", "ended_at": null,
            "ttyd_port": 7682, "ttyd_pid": 100
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(Deployment.self, from: json)
        XCTAssertFalse(deployment.runningDuration.isEmpty)
        XCTAssertTrue(deployment.runningDuration.hasSuffix("m"), "Short duration should end with 'm'")
        XCTAssertFalse(deployment.runningDuration.contains("h"), "Short duration should not contain hours")
    }

    func testDeploymentRunningDurationInvalidDate() throws {
        // Invalid ISO date string should result in empty duration
        let json = """
        {
            "id": 1, "repo_id": 1, "issue_number": 1,
            "branch_name": "b", "workspace_mode": "worktree",
            "workspace_path": "/tmp", "linked_pr_number": null,
            "state": "active",
            "launched_at": "not-a-date", "ended_at": null,
            "ttyd_port": 7682, "ttyd_pid": 100
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(Deployment.self, from: json)
        XCTAssertNil(deployment.launchedDate)
        XCTAssertEqual(deployment.runningDuration, "")
    }

    func testActiveDeploymentLaunchedDate() throws {
        let json = """
        {
            "id": 1, "repo_id": 1, "issue_number": 1,
            "branch_name": "b", "workspace_mode": "worktree",
            "workspace_path": "/tmp", "linked_pr_number": null,
            "state": "active",
            "launched_at": "2026-04-27T08:00:00Z", "ended_at": null,
            "ttyd_port": 7682, "ttyd_pid": 100,
            "owner": "org", "repo_name": "app"
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(ActiveDeployment.self, from: json)
        XCTAssertNotNil(deployment.launchedDate)
    }

    func testActiveDeploymentRunningDuration() throws {
        let recentISO = ISO8601DateFormatter().string(from: Date().addingTimeInterval(-7200)) // 2 hours ago
        let json = """
        {
            "id": 1, "repo_id": 1, "issue_number": 1,
            "branch_name": "b", "workspace_mode": "worktree",
            "workspace_path": "/tmp", "linked_pr_number": null,
            "state": "active",
            "launched_at": "\(recentISO)", "ended_at": null,
            "ttyd_port": 7682, "ttyd_pid": 100,
            "owner": "org", "repo_name": "app"
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(ActiveDeployment.self, from: json)
        XCTAssertFalse(deployment.runningDuration.isEmpty)
        XCTAssertTrue(deployment.runningDuration.contains("h"), "2-hour deployment should show hours")
    }

    func testActiveDeploymentRunningDurationInvalidDate() throws {
        let json = """
        {
            "id": 1, "repo_id": 1, "issue_number": 1,
            "branch_name": "b", "workspace_mode": "worktree",
            "workspace_path": "/tmp", "linked_pr_number": null,
            "state": "active",
            "launched_at": "invalid", "ended_at": null,
            "ttyd_port": 7682, "ttyd_pid": 100,
            "owner": "org", "repo_name": "app"
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(ActiveDeployment.self, from: json)
        XCTAssertNil(deployment.launchedDate)
        XCTAssertEqual(deployment.runningDuration, "")
    }

    // MARK: - GitHubIssue Date Computed Properties

    func testIssueUpdatedDateParsing() throws {
        let json = """
        {
            "number": 1, "title": "Test", "body": null,
            "state": "open", "labels": [], "assignees": null,
            "user": null, "comment_count": 0,
            "created_at": "2026-04-27T10:00:00Z",
            "updated_at": "2026-04-27T10:00:00Z",
            "closed_at": null, "html_url": "https://example.com"
        }
        """.data(using: .utf8)!

        let issue = try decoder.decode(GitHubIssue.self, from: json)
        XCTAssertNotNil(issue.updatedDate)
    }

    func testIssueUpdatedDateInvalid() throws {
        let json = """
        {
            "number": 1, "title": "Test", "body": null,
            "state": "open", "labels": [], "assignees": null,
            "user": null, "comment_count": 0,
            "created_at": "not-a-date",
            "updated_at": "also-not-a-date",
            "closed_at": null, "html_url": "https://example.com"
        }
        """.data(using: .utf8)!

        let issue = try decoder.decode(GitHubIssue.self, from: json)
        XCTAssertNil(issue.updatedDate)
        XCTAssertEqual(issue.timeAgo, "")
    }

    func testIssueTimeAgoNonEmpty() throws {
        let json = """
        {
            "number": 1, "title": "Test", "body": null,
            "state": "open", "labels": [], "assignees": null,
            "user": null, "comment_count": 0,
            "created_at": "2026-04-27T10:00:00Z",
            "updated_at": "2026-04-27T10:00:00Z",
            "closed_at": null, "html_url": "https://example.com"
        }
        """.data(using: .utf8)!

        let issue = try decoder.decode(GitHubIssue.self, from: json)
        XCTAssertFalse(issue.timeAgo.isEmpty)
    }

    // MARK: - Additional Model Response Types

    func testUpdateIssueResponseDecoding() throws {
        let json = """
        {"success": true, "error": null}
        """.data(using: .utf8)!
        let response = try decoder.decode(UpdateIssueResponse.self, from: json)
        XCTAssertTrue(response.success)
    }

    func testEditCommentResponseDecoding() throws {
        let json = """
        {"success": false, "error": "Comment not found"}
        """.data(using: .utf8)!
        let response = try decoder.decode(EditCommentResponse.self, from: json)
        XCTAssertFalse(response.success)
        XCTAssertEqual(response.error, "Comment not found")
    }

    func testWorktreeCleanupResponseDecoding() throws {
        let json = """
        {"success": true, "removed": 3, "error": null}
        """.data(using: .utf8)!
        let response = try decoder.decode(WorktreeCleanupResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.removed, 3)
    }

    func testWorktreeCleanupResponseNullRemoved() throws {
        let json = """
        {"success": false, "removed": null, "error": "Permission denied"}
        """.data(using: .utf8)!
        let response = try decoder.decode(WorktreeCleanupResponse.self, from: json)
        XCTAssertFalse(response.success)
        XCTAssertNil(response.removed)
        XCTAssertEqual(response.error, "Permission denied")
    }

    func testPullCommentResponseDecoding() throws {
        let json = """
        {"success": true, "comment_id": 42, "error": null}
        """.data(using: .utf8)!
        let response = try decoder.decode(PullCommentResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.commentId, 42)
    }

    func testIssueCommentResponseDecoding() throws {
        let json = """
        {"success": true, "comment_id": 88, "error": null}
        """.data(using: .utf8)!
        let response = try decoder.decode(IssueCommentResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.commentId, 88)
    }

    func testCreateDraftResponseDecoding() throws {
        let json = """
        {"success": true, "id": "draft-new", "error": null}
        """.data(using: .utf8)!
        let response = try decoder.decode(CreateDraftResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.id, "draft-new")
    }

    func testSuccessResponseDecoding() throws {
        let json = """
        {"success": true, "error": null}
        """.data(using: .utf8)!
        let response = try decoder.decode(SuccessResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertNil(response.error)
    }

    func testSuccessResponseWithError() throws {
        let json = """
        {"success": false, "error": "Something went wrong"}
        """.data(using: .utf8)!
        let response = try decoder.decode(SuccessResponse.self, from: json)
        XCTAssertFalse(response.success)
        XCTAssertEqual(response.error, "Something went wrong")
    }

    // MARK: - Settings Response Types

    func testAddRepoResponseDecoding() throws {
        let json = """
        {
            "success": true,
            "repo": {"id": 5, "owner": "org", "name": "app", "local_path": null, "branch_pattern": null, "created_at": "2026-04-27T00:00:00Z"},
            "error": null
        }
        """.data(using: .utf8)!
        let response = try decoder.decode(AddRepoResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.repo?.owner, "org")
        XCTAssertEqual(response.repo?.name, "app")
    }

    func testRemoveRepoResponseDecoding() throws {
        let json = """
        {"success": true, "error": null}
        """.data(using: .utf8)!
        let response = try decoder.decode(RemoveRepoResponse.self, from: json)
        XCTAssertTrue(response.success)
    }

    func testUpdateRepoResponseDecoding() throws {
        let json = """
        {
            "success": true,
            "repo": {"id": 5, "owner": "org", "name": "app", "local_path": "/dev/app", "branch_pattern": "issue-{{number}}", "created_at": "2026-04-27T00:00:00Z"},
            "error": null
        }
        """.data(using: .utf8)!
        let response = try decoder.decode(UpdateRepoResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.repo?.localPath, "/dev/app")
    }

    // MARK: - ListEnhancements Response Types

    func testUserResponseDecoding() throws {
        let json = """
        {"login": "neonwatty"}
        """.data(using: .utf8)!
        let response = try decoder.decode(UserResponse.self, from: json)
        XCTAssertEqual(response.login, "neonwatty")
    }

    func testParsedIssueDecoding() throws {
        let json = """
        {
            "id": "p1",
            "original_text": "Fix the login bug",
            "title": "Fix login bug",
            "body": "Users cannot login",
            "type": "bug",
            "repo_owner": "org",
            "repo_name": "app",
            "repo_confidence": 0.95,
            "suggested_labels": ["bug", "auth"],
            "clarity": "high"
        }
        """.data(using: .utf8)!
        let parsed = try decoder.decode(ParsedIssue.self, from: json)
        XCTAssertEqual(parsed.id, "p1")
        XCTAssertEqual(parsed.title, "Fix login bug")
        XCTAssertEqual(parsed.type, "bug")
        XCTAssertEqual(parsed.repoOwner, "org")
        XCTAssertEqual(parsed.repoConfidence, 0.95)
        XCTAssertEqual(parsed.suggestedLabels, ["bug", "auth"])
    }

    func testParsedIssueNullRepo() throws {
        let json = """
        {
            "id": "p2",
            "original_text": "Something",
            "title": "Something",
            "body": "",
            "type": "feature",
            "repo_owner": null,
            "repo_name": null,
            "repo_confidence": 0.0,
            "suggested_labels": [],
            "clarity": "low"
        }
        """.data(using: .utf8)!
        let parsed = try decoder.decode(ParsedIssue.self, from: json)
        XCTAssertNil(parsed.repoOwner)
        XCTAssertNil(parsed.repoName)
    }

    func testBatchCreateResultDecoding() throws {
        let json = """
        {
            "created": 2, "drafted": 1, "failed": 0,
            "results": [
                {"id": "a", "success": true, "issue_number": 10, "draft_id": null, "error": null, "owner": "org", "repo": "app"},
                {"id": "b", "success": true, "issue_number": 11, "draft_id": null, "error": null, "owner": "org", "repo": "app"},
                {"id": "c", "success": true, "issue_number": null, "draft_id": "d1", "error": null, "owner": "org", "repo": "app"}
            ]
        }
        """.data(using: .utf8)!
        let result = try decoder.decode(BatchCreateResult.self, from: json)
        XCTAssertEqual(result.created, 2)
        XCTAssertEqual(result.drafted, 1)
        XCTAssertEqual(result.failed, 0)
        XCTAssertEqual(result.results.count, 3)
        XCTAssertEqual(result.results[2].draftId, "d1")
    }

    func testImageUploadResponseDecoding() throws {
        let json = """
        {"url": "https://github.com/user-attachments/assets/abc123"}
        """.data(using: .utf8)!
        let response = try decoder.decode(ImageUploadResponse.self, from: json)
        XCTAssertEqual(response.url, "https://github.com/user-attachments/assets/abc123")
    }

    // MARK: - Deployment isActive Edge Cases

    func testDeploymentEndedWithNullEndedAt() throws {
        // state is "ended" but endedAt is null (unusual but possible)
        let json = """
        {
            "id": 1, "repo_id": 1, "issue_number": 1,
            "branch_name": "b", "workspace_mode": "worktree",
            "workspace_path": "/tmp", "linked_pr_number": null,
            "state": "ended",
            "launched_at": "2026-04-27T08:00:00Z", "ended_at": null,
            "ttyd_port": null, "ttyd_pid": null
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(Deployment.self, from: json)
        // state != .active, so isActive is false regardless of endedAt
        XCTAssertFalse(deployment.isActive)
    }
}
