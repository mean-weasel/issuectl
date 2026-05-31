import XCTest
@testable import IssueCTL

final class ModelDecodingTests: XCTestCase {

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    // MARK: - ServerHealth

    func testServerHealthDecoding() throws {
        let json = """
        {"ok": true, "version": "1.2.3", "timestamp": "2026-04-27T10:00:00Z"}
        """.data(using: .utf8)!

        let health = try decoder.decode(ServerHealth.self, from: json)
        XCTAssertTrue(health.ok)
        XCTAssertEqual(health.version, "1.2.3")
        XCTAssertEqual(health.timestamp, "2026-04-27T10:00:00Z")
    }

    func testServerHealthDecodingNotOk() throws {
        let json = """
        {"ok": false, "version": "0.0.1", "timestamp": "2026-01-01T00:00:00Z"}
        """.data(using: .utf8)!

        let health = try decoder.decode(ServerHealth.self, from: json)
        XCTAssertFalse(health.ok)
    }

    // MARK: - Repo

    func testRepoDecoding() throws {
        let json = """
        {
            "id": 42,
            "owner": "neonwatty",
            "name": "issuectl",
            "local_path": "/Users/dev/issuectl",
            "branch_pattern": "issue-{{number}}-{{slug}}",
            "created_at": "2026-04-01T12:00:00Z"
        }
        """.data(using: .utf8)!

        let repo = try decoder.decode(Repo.self, from: json)
        XCTAssertEqual(repo.id, 42)
        XCTAssertEqual(repo.owner, "neonwatty")
        XCTAssertEqual(repo.name, "issuectl")
        XCTAssertEqual(repo.localPath, "/Users/dev/issuectl")
        XCTAssertEqual(repo.branchPattern, "issue-{{number}}-{{slug}}")
        XCTAssertEqual(repo.fullName, "neonwatty/issuectl")
        XCTAssertFalse(repo.autoLaunchIssues)
        XCTAssertFalse(repo.autoReviewPrs)
        XCTAssertEqual(repo.issueAgent, .claude)
        XCTAssertEqual(repo.reviewAgent, .claude)
        XCTAssertEqual(repo.webhookPayloadMode, .metadata)
    }

    func testRepoDecodingNullOptionals() throws {
        let json = """
        {
            "id": 1,
            "owner": "test",
            "name": "repo",
            "local_path": null,
            "branch_pattern": null,
            "created_at": "2026-04-01T12:00:00Z"
        }
        """.data(using: .utf8)!

        let repo = try decoder.decode(Repo.self, from: json)
        XCTAssertNil(repo.localPath)
        XCTAssertNil(repo.branchPattern)
    }

    func testRepoDecodesAutomationFields() throws {
        let json = """
        {
            "id": 42,
            "owner": "neonwatty",
            "name": "issuectl",
            "local_path": "/Users/dev/issuectl",
            "branch_pattern": "issue-{{number}}",
            "auto_launch_issues": true,
            "auto_review_prs": true,
            "issue_agent": "codex",
            "review_agent": "claude",
            "webhook_id": 123,
            "webhook_payload_mode": "raw",
            "review_preamble": "Focus on regressions.",
            "created_at": "2026-04-01T12:00:00Z"
        }
        """.data(using: .utf8)!

        let repo = try decoder.decode(Repo.self, from: json)
        XCTAssertTrue(repo.autoLaunchIssues)
        XCTAssertTrue(repo.autoReviewPrs)
        XCTAssertEqual(repo.issueAgent, .codex)
        XCTAssertEqual(repo.reviewAgent, .claude)
        XCTAssertEqual(repo.webhookId, 123)
        XCTAssertEqual(repo.webhookPayloadMode, .raw)
        XCTAssertEqual(repo.reviewPreamble, "Focus on regressions.")
    }

    func testReposResponseDecoding() throws {
        let json = """
        {
            "repos": [
                {"id": 1, "owner": "a", "name": "b", "local_path": null, "branch_pattern": null, "created_at": "2026-04-01T00:00:00Z"},
                {"id": 2, "owner": "c", "name": "d", "local_path": "/tmp", "branch_pattern": null, "created_at": "2026-04-02T00:00:00Z"}
            ]
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(ReposResponse.self, from: json)
        XCTAssertEqual(response.repos.count, 2)
        XCTAssertEqual(response.repos[0].fullName, "a/b")
        XCTAssertEqual(response.repos[1].localPath, "/tmp")
    }

    // MARK: - GitHubIssue

    func testGitHubIssueDecoding() throws {
        let json = """
        {
            "number": 123,
            "title": "Fix login bug",
            "body": "Users cannot login with OAuth",
            "state": "open",
            "labels": [
                {"name": "bug", "color": "d73a4a", "description": "Something isn't working"}
            ],
            "assignees": [
                {"login": "dev1", "avatar_url": "https://github.com/dev1.png"}
            ],
            "user": {"login": "reporter", "avatar_url": "https://github.com/reporter.png"},
            "comment_count": 5,
            "created_at": "2026-04-10T08:00:00Z",
            "updated_at": "2026-04-15T14:30:00Z",
            "closed_at": null,
            "html_url": "https://github.com/org/repo/issues/123"
        }
        """.data(using: .utf8)!

        let issue = try decoder.decode(GitHubIssue.self, from: json)
        XCTAssertEqual(issue.number, 123)
        XCTAssertEqual(issue.title, "Fix login bug")
        XCTAssertEqual(issue.body, "Users cannot login with OAuth")
        XCTAssertEqual(issue.state, "open")
        XCTAssertTrue(issue.isOpen)
        XCTAssertEqual(issue.id, "https://github.com/org/repo/issues/123")
        XCTAssertEqual(issue.labels.count, 1)
        XCTAssertEqual(issue.labels[0].name, "bug")
        XCTAssertEqual(issue.labels[0].color, "d73a4a")
        XCTAssertEqual(issue.labels[0].description, "Something isn't working")
        XCTAssertEqual(issue.assignees?.count, 1)
        XCTAssertEqual(issue.assignees?[0].login, "dev1")
        XCTAssertEqual(issue.user?.login, "reporter")
        XCTAssertEqual(issue.commentCount, 5)
        XCTAssertNil(issue.closedAt)
        XCTAssertEqual(issue.htmlUrl, "https://github.com/org/repo/issues/123")
    }

    func testGitHubIssueClosedState() throws {
        let json = """
        {
            "number": 99,
            "title": "Closed issue",
            "body": null,
            "state": "closed",
            "labels": [],
            "assignees": null,
            "user": null,
            "comment_count": 0,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z",
            "closed_at": "2026-01-02T00:00:00Z",
            "html_url": "https://github.com/org/repo/issues/99"
        }
        """.data(using: .utf8)!

        let issue = try decoder.decode(GitHubIssue.self, from: json)
        XCTAssertFalse(issue.isOpen)
        XCTAssertNil(issue.body)
        XCTAssertNil(issue.assignees)
        XCTAssertNil(issue.user)
        XCTAssertEqual(issue.closedAt, "2026-01-02T00:00:00Z")
    }

    func testGitHubIssueDateParsing() throws {
        let json = """
        {
            "number": 1,
            "title": "Test",
            "body": null,
            "state": "open",
            "labels": [],
            "assignees": null,
            "user": null,
            "comment_count": 0,
            "created_at": "2026-04-27T10:00:00Z",
            "updated_at": "2026-04-27T10:00:00Z",
            "closed_at": null,
            "html_url": "https://example.com"
        }
        """.data(using: .utf8)!

        let issue = try decoder.decode(GitHubIssue.self, from: json)
        XCTAssertNotNil(issue.updatedDate)
        XCTAssertFalse(issue.timeAgo.isEmpty)
    }

    func testIssuesResponseDecoding() throws {
        let json = """
        {
            "issues": [
                {
                    "number": 1,
                    "title": "First",
                    "body": null,
                    "state": "open",
                    "labels": [],
                    "assignees": [],
                    "user": null,
                    "comment_count": 0,
                    "created_at": "2026-01-01T00:00:00Z",
                    "updated_at": "2026-01-01T00:00:00Z",
                    "closed_at": null,
                    "html_url": "https://example.com/1"
                }
            ],
            "from_cache": true,
            "cached_at": "2026-04-27T09:00:00Z"
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(IssuesResponse.self, from: json)
        XCTAssertEqual(response.issues.count, 1)
        XCTAssertTrue(response.fromCache)
        XCTAssertEqual(response.cachedAt, "2026-04-27T09:00:00Z")
    }

    func testIssuesResponseNotCached() throws {
        let json = """
        {
            "issues": [],
            "from_cache": false,
            "cached_at": null
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(IssuesResponse.self, from: json)
        XCTAssertTrue(response.issues.isEmpty)
        XCTAssertFalse(response.fromCache)
        XCTAssertNil(response.cachedAt)
    }

    // MARK: - GitHubComment

    func testGitHubCommentDecoding() throws {
        let json = """
        {
            "id": 555,
            "body": "LGTM!",
            "user": {"login": "reviewer", "avatar_url": "https://github.com/reviewer.png"},
            "created_at": "2026-04-20T10:00:00Z",
            "updated_at": "2026-04-20T10:00:00Z",
            "html_url": "https://github.com/org/repo/issues/1#comment-555"
        }
        """.data(using: .utf8)!

        let comment = try decoder.decode(GitHubComment.self, from: json)
        XCTAssertEqual(comment.id, 555)
        XCTAssertEqual(comment.body, "LGTM!")
        XCTAssertEqual(comment.user?.login, "reviewer")
    }

    // MARK: - IssueDetailResponse

    func testIssueDetailResponseDecoding() throws {
        let json = """
        {
            "issue": {
                "number": 10,
                "title": "Detail test",
                "body": "Body text",
                "state": "open",
                "labels": [],
                "assignees": [],
                "user": null,
                "comment_count": 1,
                "created_at": "2026-04-01T00:00:00Z",
                "updated_at": "2026-04-02T00:00:00Z",
                "closed_at": null,
                "html_url": "https://example.com/10"
            },
            "comments": [
                {
                    "id": 1,
                    "body": "Hello",
                    "user": null,
                    "created_at": "2026-04-01T01:00:00Z",
                    "updated_at": "2026-04-01T01:00:00Z",
                    "html_url": "https://example.com/10#1"
                }
            ],
            "deployments": [],
            "linkedPRs": [],
            "referenced_files": ["src/main.ts", "README.md"],
            "from_cache": false
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(IssueDetailResponse.self, from: json)
        XCTAssertEqual(response.issue.number, 10)
        XCTAssertEqual(response.comments.count, 1)
        XCTAssertTrue(response.deployments.isEmpty)
        XCTAssertTrue(response.linkedPRs.isEmpty)
        XCTAssertEqual(response.referencedFiles, ["src/main.ts", "README.md"])
        XCTAssertFalse(response.fromCache)
    }

    // MARK: - GitHubPull

    func testGitHubPullDecoding() throws {
        let json = """
        {
            "number": 42,
            "title": "Add feature X",
            "body": "Implements feature X as described in #10",
            "state": "open",
            "merged": false,
            "user": {"login": "dev", "avatar_url": "https://github.com/dev.png"},
            "head_ref": "feature-x",
            "base_ref": "main",
            "additions": 150,
            "deletions": 30,
            "changed_files": 5,
            "created_at": "2026-04-20T08:00:00Z",
            "updated_at": "2026-04-21T10:00:00Z",
            "merged_at": null,
            "closed_at": null,
            "html_url": "https://github.com/org/repo/pull/42"
        }
        """.data(using: .utf8)!

        let pull = try decoder.decode(GitHubPull.self, from: json)
        XCTAssertEqual(pull.number, 42)
        XCTAssertEqual(pull.title, "Add feature X")
        XCTAssertTrue(pull.isOpen)
        XCTAssertFalse(pull.merged)
        XCTAssertEqual(pull.headRef, "feature-x")
        XCTAssertEqual(pull.baseRef, "main")
        XCTAssertEqual(pull.additions, 150)
        XCTAssertEqual(pull.deletions, 30)
        XCTAssertEqual(pull.changedFiles, 5)
        XCTAssertEqual(pull.diffSummary, "+150 -30")
        XCTAssertEqual(pull.id, "https://github.com/org/repo/pull/42")
        XCTAssertNil(pull.mergedAt)
    }

    func testGitHubPullMergedState() throws {
        let json = """
        {
            "number": 50,
            "title": "Merged PR",
            "body": null,
            "state": "closed",
            "merged": true,
            "user": null,
            "head_ref": "fix-bug",
            "base_ref": "main",
            "additions": 10,
            "deletions": 5,
            "changed_files": 2,
            "created_at": "2026-04-01T00:00:00Z",
            "updated_at": "2026-04-05T00:00:00Z",
            "merged_at": "2026-04-05T00:00:00Z",
            "closed_at": "2026-04-05T00:00:00Z",
            "html_url": "https://github.com/org/repo/pull/50"
        }
        """.data(using: .utf8)!

        let pull = try decoder.decode(GitHubPull.self, from: json)
        XCTAssertFalse(pull.isOpen)
        XCTAssertTrue(pull.merged)
        XCTAssertEqual(pull.mergedAt, "2026-04-05T00:00:00Z")
    }

    // MARK: - GitHubCheck

    func testGitHubCheckDecoding() throws {
        let json = """
        {
            "name": "CI / Build",
            "status": "completed",
            "conclusion": "success",
            "started_at": "2026-04-20T08:00:00Z",
            "completed_at": "2026-04-20T08:05:00Z",
            "html_url": "https://github.com/org/repo/runs/123"
        }
        """.data(using: .utf8)!

        let check = try decoder.decode(GitHubCheck.self, from: json)
        XCTAssertEqual(check.name, "CI / Build")
        XCTAssertTrue(check.isPassing)
        XCTAssertFalse(check.isFailing)
        XCTAssertFalse(check.isPending)
        XCTAssertEqual(check.id, "CI / Build")
    }

    func testGitHubCheckPending() throws {
        let json = """
        {
            "name": "Test Suite",
            "status": "in_progress",
            "conclusion": null,
            "started_at": "2026-04-20T08:00:00Z",
            "completed_at": null,
            "html_url": null
        }
        """.data(using: .utf8)!

        let check = try decoder.decode(GitHubCheck.self, from: json)
        XCTAssertTrue(check.isPending)
        XCTAssertFalse(check.isPassing)
        XCTAssertFalse(check.isFailing)
    }

    func testGitHubCheckFailing() throws {
        let json = """
        {
            "name": "Lint",
            "status": "completed",
            "conclusion": "failure",
            "started_at": null,
            "completed_at": null,
            "html_url": null
        }
        """.data(using: .utf8)!

        let check = try decoder.decode(GitHubCheck.self, from: json)
        XCTAssertTrue(check.isFailing)
        XCTAssertFalse(check.isPassing)
        XCTAssertFalse(check.isPending)
    }

    // MARK: - PullDetailResponse

    func testPullDetailResponseDecoding() throws {
        let json = """
        {
            "pull": {
                "number": 42,
                "title": "PR",
                "body": null,
                "state": "open",
                "merged": false,
                "user": null,
                "head_ref": "feat",
                "base_ref": "main",
                "additions": 10,
                "deletions": 2,
                "changed_files": 1,
                "created_at": "2026-04-01T00:00:00Z",
                "updated_at": "2026-04-01T00:00:00Z",
                "merged_at": null,
                "closed_at": null,
                "html_url": "https://example.com/42",
                "labels": [
                    {"name": "issuectl:auto-review", "color": "8250df", "description": "Auto review"}
                ]
            },
            "checks": [
                {"name": "CI", "status": "completed", "conclusion": "success", "started_at": null, "completed_at": null, "html_url": null}
            ],
            "files": [
                {"filename": "src/index.ts", "status": "modified", "additions": 10, "deletions": 2}
            ],
            "linked_issue": null,
            "reviews": [
                {"id": 1, "user": {"login": "rev", "avatar_url": "https://x.com"}, "state": "approved", "body": "LGTM", "submitted_at": "2026-04-01T00:00:00Z"}
            ],
            "from_cache": false,
            "cached_at": null
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(PullDetailResponse.self, from: json)
        XCTAssertEqual(response.pull.number, 42)
        XCTAssertEqual(response.pull.labels.map(\.name), ["issuectl:auto-review"])
        XCTAssertEqual(response.checks.count, 1)
        XCTAssertEqual(response.files.count, 1)
        XCTAssertEqual(response.files[0].filename, "src/index.ts")
        XCTAssertNil(response.linkedIssue)
        XCTAssertEqual(response.reviews.count, 1)
        XCTAssertTrue(response.reviews[0].isApproved)
        XCTAssertFalse(response.fromCache)
    }

    func testPullDetailResponseMissingReviews() throws {
        // The custom init handles missing reviews by defaulting to []
        let json = """
        {
            "pull": {
                "number": 1,
                "title": "PR",
                "body": null,
                "state": "open",
                "merged": false,
                "user": null,
                "head_ref": "f",
                "base_ref": "m",
                "additions": 0,
                "deletions": 0,
                "changed_files": 0,
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
                "merged_at": null,
                "closed_at": null,
                "html_url": "https://example.com"
            },
            "checks": [],
            "files": [],
            "linked_issue": null,
            "from_cache": true,
            "cached_at": "2026-04-27T00:00:00Z"
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(PullDetailResponse.self, from: json)
        XCTAssertTrue(response.reviews.isEmpty)
        XCTAssertTrue(response.fromCache)
        XCTAssertEqual(response.cachedAt, "2026-04-27T00:00:00Z")
    }

    // MARK: - GitHubPullReview

    func testGitHubPullReviewStates() throws {
        let approved = """
        {"id": 1, "user": null, "state": "approved", "body": "", "submitted_at": null}
        """.data(using: .utf8)!

        let changesRequested = """
        {"id": 2, "user": null, "state": "changes_requested", "body": "fix this", "submitted_at": null}
        """.data(using: .utf8)!

        let commented = """
        {"id": 3, "user": null, "state": "commented", "body": "looks good", "submitted_at": null}
        """.data(using: .utf8)!

        let r1 = try decoder.decode(GitHubPullReview.self, from: approved)
        XCTAssertTrue(r1.isApproved)
        XCTAssertFalse(r1.isChangesRequested)
        XCTAssertFalse(r1.isCommented)

        let r2 = try decoder.decode(GitHubPullReview.self, from: changesRequested)
        XCTAssertFalse(r2.isApproved)
        XCTAssertTrue(r2.isChangesRequested)

        let r3 = try decoder.decode(GitHubPullReview.self, from: commented)
        XCTAssertTrue(r3.isCommented)
    }

    // MARK: - Deployment

    func testDeploymentDecoding() throws {
        let json = """
        {
            "id": 7,
            "repo_id": 42,
            "issue_number": 10,
            "branch_name": "issue-10-fix-bug",
            "workspace_mode": "worktree",
            "workspace_path": "/tmp/worktrees/issue-10",
            "linked_pr_number": 15,
            "state": "active",
            "launched_at": "2026-04-27T08:00:00Z",
            "ended_at": null,
            "ttyd_port": 7682,
            "ttyd_pid": 12345
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(Deployment.self, from: json)
        XCTAssertEqual(deployment.id, 7)
        XCTAssertEqual(deployment.repoId, 42)
        XCTAssertEqual(deployment.issueNumber, 10)
        XCTAssertEqual(deployment.branchName, "issue-10-fix-bug")
        XCTAssertEqual(deployment.workspaceMode, .worktree)
        XCTAssertEqual(deployment.workspacePath, "/tmp/worktrees/issue-10")
        XCTAssertEqual(deployment.linkedPrNumber, 15)
        XCTAssertEqual(deployment.state, .active)
        XCTAssertTrue(deployment.isActive)
        XCTAssertNil(deployment.endedAt)
        XCTAssertEqual(deployment.ttydPort, 7682)
        XCTAssertNotNil(deployment.launchedDate)
    }

    func testDeploymentEndedNotActive() throws {
        let json = """
        {
            "id": 8,
            "repo_id": 42,
            "issue_number": 10,
            "branch_name": "issue-10",
            "workspace_mode": "worktree",
            "workspace_path": "/tmp",
            "linked_pr_number": null,
            "state": "ended",
            "launched_at": "2026-04-26T08:00:00Z",
            "ended_at": "2026-04-26T10:00:00Z",
            "ttyd_port": null,
            "ttyd_pid": null
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(Deployment.self, from: json)
        XCTAssertEqual(deployment.state, .ended)
        XCTAssertFalse(deployment.isActive)
        XCTAssertNil(deployment.linkedPrNumber)
        XCTAssertNil(deployment.ttydPort)
        XCTAssertNil(deployment.ttydPid)
    }

    // MARK: - Diagnostics

    func testDeploymentDiagnosticsResponseDecoding() throws {
        let json = """
        {
            "events": [
                {
                    "id": 101,
                    "timestamp": 1778760000000,
                    "level": "info",
                    "event": "launch.requested",
                    "source": "core.launch",
                    "correlation_id": "launch-abc",
                    "owner": "org",
                    "repo": "alpha",
                    "issue_number": 42,
                    "target_type": "issue",
                    "target_number": 42,
                    "deployment_id": 9001,
                    "session_name": "issuectl-alpha-42",
                    "ttyd_port": null,
                    "ttyd_pid": null,
                    "status": "starting",
                    "message": "Launch requested.",
                    "data": {"agent": "codex", "attempt": 1}
                },
                {
                    "id": 102,
                    "timestamp": 1778760002500,
                    "level": "error",
                    "event": "launch.spawn_failed",
                    "source": "core.launch",
                    "correlation_id": "launch-abc",
                    "owner": "org",
                    "repo": "alpha",
                    "issue_number": 42,
                    "target_type": "issue",
                    "target_number": 42,
                    "deployment_id": 9001,
                    "session_name": "issuectl-alpha-42",
                    "ttyd_port": 19001,
                    "ttyd_pid": 333,
                    "status": "failed",
                    "message": "tmux failed to create session.",
                    "data": {"exit_code": 1, "retryable": false}
                }
            ],
            "from_cache": false,
            "cached_at": null
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(DeploymentDiagnosticsResponse.self, from: json)

        XCTAssertEqual(response.events.count, 2)
        XCTAssertEqual(response.events[0].level, .info)
        XCTAssertEqual(response.events[0].correlationId, "launch-abc")
        XCTAssertEqual(response.events[0].targetType, .issue)
        XCTAssertEqual(response.events[0].data?["agent"]?.stringValue, "codex")
        XCTAssertEqual(response.events[0].data?["attempt"]?.integerValue, 1)
        XCTAssertEqual(response.events[1].level, .error)
        XCTAssertEqual(response.events[1].data?["retryable"]?.boolValue, false)
        XCTAssertEqual(response.firstFailure?.event, "launch.spawn_failed")
        XCTAssertEqual(response.summaryText, "2 diagnostic events, first failure: launch.spawn_failed")
    }

    func testDeploymentDiagnosticsEmptySummary() throws {
        let json = """
        {"events": [], "from_cache": false, "cached_at": null}
        """.data(using: .utf8)!

        let response = try decoder.decode(DeploymentDiagnosticsResponse.self, from: json)

        XCTAssertNil(response.firstFailure)
        XCTAssertEqual(response.summaryText, "No diagnostic events recorded yet")
    }

    func testDeploymentDiagnosticsSummaryUsesServerSummaryAndFilters() throws {
        let json = """
        {
          "events": [
            {
              "id": 101,
              "timestamp": 1780000000000,
              "level": "info",
              "event": "deployment.activated",
              "message": "Deployment activated",
              "deployment_id": 42,
              "target_type": "issue",
              "target_number": 560,
              "target_label": "Issue #560",
              "metadata": {"ttydPort": 49152}
            }
          ],
          "filters": {
            "deployment_id": 42,
            "target_type": "issue",
            "target_number": 560,
            "limit": 1
          },
          "summary": {
            "count": 3,
            "level_counts": {"info": 1, "warn": 1, "error": 1},
            "latest_timestamp": 1780000000000,
            "latest_timestamp_iso": "2026-05-29T20:26:40.000Z"
          }
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(DeploymentDiagnosticsResponse.self, from: json)

        XCTAssertEqual(response.summaryText, "3 diagnostic events, 1 error")
        XCTAssertEqual(response.summaryRows.map(\.0), ["Events", "Errors", "Warnings", "Info", "Limit", "Latest"])
        XCTAssertEqual(response.summaryRows.map(\.1), ["3", "1", "1", "1", "Latest 1", "2026-05-29T20:26:40.000Z"])
        XCTAssertEqual(response.filters?.targetDescription, "Issue #560")
        XCTAssertEqual(response.filters?.limitDescription, "Latest 1")
        XCTAssertEqual(response.eventLimitNotice, "Showing latest 1 diagnostic event")
        XCTAssertTrue(response.hasFailure)
        XCTAssertTrue(response.events[0].metadataRows.contains { $0.0 == "ttydPort" && $0.1 == "49152" })
    }

    func testDeploymentDiagnosticsLimitNoticeOnlyAppearsWhenResultsHitLimit() throws {
        let json = """
        {
          "events": [
            {"id": 101, "timestamp": 1780000000000, "level": "info", "event": "deployment.activated", "message": "Deployment activated"},
            {"id": 102, "timestamp": 1780000001000, "level": "info", "event": "deployment.visible", "message": "Deployment visible"}
          ],
          "filters": {"deployment_id": null, "target_type": "pr", "target_number": 44, "limit": 12},
          "summary": {"count": 2, "level_counts": {"info": 2}, "latest_timestamp": 1780000001000, "latest_timestamp_iso": "2026-05-29T20:26:41.000Z"}
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(DeploymentDiagnosticsResponse.self, from: json)

        XCTAssertNil(response.eventLimitNotice)
    }

    // MARK: - ActiveDeployment

    func testActiveDeploymentDecoding() throws {
        let json = """
        {
            "id": 5,
            "repo_id": 42,
            "issue_number": 7,
            "branch_name": "issue-7-feature",
            "workspace_mode": "worktree",
            "workspace_path": "/tmp/wt",
            "linked_pr_number": null,
            "state": "active",
            "launched_at": "2026-04-27T06:00:00Z",
            "ended_at": null,
            "ttyd_port": 7683,
            "ttyd_pid": 999,
            "owner": "neonwatty",
            "repo_name": "issuectl"
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(ActiveDeployment.self, from: json)
        XCTAssertEqual(deployment.id, 5)
        XCTAssertEqual(deployment.owner, "neonwatty")
        XCTAssertEqual(deployment.repoName, "issuectl")
        XCTAssertEqual(deployment.repoFullName, "neonwatty/issuectl")
        XCTAssertEqual(deployment.targetType, .issue)
        XCTAssertEqual(deployment.targetNumber, 7)
        XCTAssertEqual(deployment.targetLabel, "#7")
        XCTAssertNotNil(deployment.launchedDate)
        XCTAssertFalse(deployment.runningDuration.isEmpty)
    }

    func testActiveDeploymentDecodesPrTargetWithoutIssueNumber() throws {
        let json = """
        {
            "id": 6,
            "repo_id": 42,
            "issue_number": null,
            "target_type": "pr",
            "target_number": 44,
            "agent": "codex",
            "terminal_backend": "ttyd",
            "triggered_by": "webhook",
            "terminal_reason": "review",
            "parent_deployment_id": null,
            "webhook_depth": 1,
            "idle_since": null,
            "branch_name": "feature/webhook-review",
            "workspace_mode": "worktree",
            "workspace_path": "/tmp/wt",
            "linked_pr_number": null,
            "state": "active",
            "launched_at": "2026-04-27T06:00:00Z",
            "ended_at": null,
            "ttyd_port": 7684,
            "ttyd_pid": 1000,
            "owner": "neonwatty",
            "repo_name": "issuectl"
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(ActiveDeployment.self, from: json)
        XCTAssertEqual(deployment.issueNumber, 44)
        XCTAssertEqual(deployment.targetType, .pr)
        XCTAssertEqual(deployment.targetNumber, 44)
        XCTAssertEqual(deployment.agent, .codex)
        XCTAssertEqual(deployment.terminalBackend, .ttyd)
        XCTAssertEqual(deployment.triggeredBy, .webhook)
        XCTAssertEqual(deployment.terminalReason, "review")
        XCTAssertEqual(deployment.webhookDepth, 1)
        XCTAssertEqual(deployment.targetLabel, "PR #44")
        XCTAssertEqual(deployment.targetTitle, "neonwatty/issuectl PR #44")
        XCTAssertFalse(deployment.isIssueTarget)
    }

    func testActiveDeploymentReviewSessionPresentationIncludesProvenance() throws {
        let json = """
        {
            "id": 6,
            "repo_id": 42,
            "issue_number": null,
            "target_type": "pr",
            "target_number": 44,
            "agent": "codex",
            "terminal_backend": "pty_bridge",
            "triggered_by": "comment_command",
            "terminal_reason": "review",
            "parent_deployment_id": 5,
            "webhook_depth": 2,
            "idle_since": null,
            "branch_name": "feature/webhook-review",
            "workspace_mode": "worktree",
            "workspace_path": "/tmp/wt",
            "linked_pr_number": null,
            "state": "active",
            "launched_at": "2026-04-27T06:00:00Z",
            "ended_at": null,
            "ttyd_port": 7684,
            "ttyd_pid": 1000,
            "owner": "neonwatty",
            "repo_name": "issuectl"
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(ActiveDeployment.self, from: json)
        XCTAssertEqual(deployment.sessionRoleTitle, "PR review session")
        XCTAssertEqual(deployment.provenanceSummary, "Comment command - Codex - follow-up #5 - depth 2")
        XCTAssertTrue(deployment.matchesPullRequest(owner: "neonwatty", repo: "issuectl", number: 44))
        XCTAssertFalse(deployment.matchesPullRequest(owner: "neonwatty", repo: "issuectl", number: 45))
    }

    func testActiveDeploymentsResponseDecoding() throws {
        let json = """
        {
            "deployments": [
                {
                    "id": 1,
                    "repo_id": 10,
                    "issue_number": 3,
                    "branch_name": "branch",
                    "workspace_mode": "worktree",
                    "workspace_path": "/tmp",
                    "linked_pr_number": null,
                    "state": "active",
                    "launched_at": "2026-04-27T00:00:00Z",
                    "ended_at": null,
                    "ttyd_port": 7682,
                    "ttyd_pid": 100,
                    "owner": "org",
                    "repo_name": "app"
                },
                {
                    "id": 2,
                    "repo_id": 10,
                    "issue_number": null,
                    "target_type": "pr",
                    "target_number": 12,
                    "branch_name": "review-12",
                    "workspace_mode": "clone",
                    "workspace_path": "/tmp/pr",
                    "linked_pr_number": null,
                    "state": "active",
                    "launched_at": "2026-04-27T01:00:00Z",
                    "ended_at": null,
                    "ttyd_port": null,
                    "ttyd_pid": null,
                    "owner": "org",
                    "repo_name": "app"
                }
            ],
            "from_cache": true,
            "cached_at": "2026-04-27T09:00:00Z"
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(ActiveDeploymentsResponse.self, from: json)
        XCTAssertEqual(response.deployments.count, 2)
        XCTAssertEqual(response.deployments[0].repoFullName, "org/app")
        XCTAssertEqual(response.deployments[1].targetLabel, "PR #12")
        XCTAssertTrue(response.fromCache)
        XCTAssertEqual(response.cachedAt, "2026-04-27T09:00:00Z")
    }

    func testWorkbenchPayloadDecoding() throws {
        let json = """
        {
            "repos": [
                {
                    "id": 1,
                    "owner": "org",
                    "name": "alpha",
                    "localPath": "/tmp/alpha",
                    "branchPattern": null,
                    "autoLaunchIssues": true,
                    "autoReviewPrs": true,
                    "issueAgent": "codex",
                    "reviewAgent": "claude",
                    "webhookId": 123,
                    "webhookPayloadMode": "metadata",
                    "badgeCount": 2,
                    "deployedCount": 1,
                    "launchAgent": "codex",
                    "terminalBackendDefault": "ttyd",
                    "issueError": null,
                    "issuesFromCache": false,
                    "issuesCachedAt": null,
                    "priorities": [{"repoId": 1, "issueNumber": 101, "priority": "high", "updatedAt": 1777440000}],
                    "deployments": [
                        {
                            "id": 9001,
                            "repoId": 1,
                            "issueNumber": 101,
                            "targetType": "issue",
                            "targetNumber": 101,
                            "agent": "codex",
                            "terminalBackend": "ttyd",
                            "triggeredBy": "manual",
                            "terminalReason": null,
                            "branchName": "issue-101",
                            "workspaceMode": "worktree",
                            "workspacePath": "/tmp/alpha",
                            "linkedPrNumber": null,
                            "state": "active",
                            "launchedAt": "2026-04-27T01:00:00Z",
                            "endedAt": null,
                            "ttydPort": 19001,
                            "ttydPid": 12001,
                            "owner": "org",
                            "repoName": "alpha"
                        }
                    ],
                    "recentCompletions": [],
                    "webhookEvents": [
                        {
                            "id": 1,
                            "deliveryId": "d1",
                            "eventType": "issues",
                            "action": "labeled",
                            "senderLogin": "alice",
                            "targetType": "issue",
                            "targetNumber": 101,
                            "receivedAt": 1777440000,
                            "intentId": 5
                        }
                    ],
                    "prReviews": [
                        {
                            "id": 10,
                            "repoId": 1,
                            "prNumber": 44,
                            "deploymentId": 9002,
                            "reviewedFromSha": null,
                            "reviewedToSha": "abc",
                            "headRepoFullName": "org/alpha",
                            "headRef": "feature",
                            "status": "in_progress",
                            "triggeredBy": "webhook",
                            "resultJson": null,
                            "startedAt": 1777440000,
                            "completedAt": null
                        }
                    ],
                    "previews": {
                        "19001": {"lines": ["running"], "lastUpdatedMs": 1777800000000, "lastChangedMs": null, "status": "active"}
                    },
                    "issues": [
                        {
                            "number": 101,
                            "title": "Launch work",
                            "state": "open",
                            "labels": ["issuectl:auto-launch"],
                            "updatedAt": "2026-04-27T01:00:00Z",
                            "priority": "high",
                            "hasActiveDeployment": true,
                            "htmlUrl": "https://github.com/org/alpha/issues/101",
                            "authorLogin": "alice"
                        }
                    ]
                }
            ],
            "deployments": [],
            "previews": {},
            "settings": {"launch_agent": "codex"},
            "health": {"ok": true, "version": "ui-test", "timestamp": "2026-04-27T00:00:00Z", "error": null},
            "user": {"login": "alice", "error": null},
            "generatedAt": "2026-04-27T00:00:00Z"
        }
        """.data(using: .utf8)!

        let payload = try decoder.decode(WorkbenchPayload.self, from: json)
        XCTAssertTrue(payload.drafts.isEmpty)
        XCTAssertEqual(payload.repos.count, 1)
        XCTAssertEqual(payload.repos[0].fullName, "org/alpha")
        XCTAssertTrue(payload.repos[0].autoLaunchIssues)
        XCTAssertEqual(payload.repos[0].issues[0].priority, .high)
        XCTAssertEqual(payload.repos[0].deployments[0].targetLabel, "#101")
        XCTAssertEqual(payload.repos[0].webhookEvents[0].targetType, .issue)
        XCTAssertEqual(payload.repos[0].prReviews[0].triggeredBy, .webhook)
        XCTAssertEqual(payload.user.login, "alice")
    }

    func testAutomationParityWorkbenchFixtureDecoding() throws {
        let fixture = try loadFixtureData("automation-parity-workbench")

        let payload = try decoder.decode(WorkbenchPayload.self, from: fixture)

        XCTAssertEqual(payload.repos.count, 2)
        XCTAssertEqual(payload.deployments.compactMap(\.triggeredBy), [.manual, .webhook, .commentCommand])
        XCTAssertEqual(payload.deployments.map(\.targetType), [.issue, .issue, .pr])
        XCTAssertEqual(payload.deployments[1].parentDeploymentId, 9401)
        XCTAssertEqual(payload.deployments[1].webhookDepth, 1)
        XCTAssertEqual(payload.previews["19002"]?.status, .idle)
        XCTAssertEqual(payload.repos[0].webhookEvents[0].targetType, .issue)
        XCTAssertEqual(payload.repos[0].prReviews[0].triggeredBy, .webhook)
        XCTAssertEqual(payload.repos[1].autoLaunchIssues, false)
    }

    func testSessionPreviewsResponseDecoding() throws {
        let json = """
        {
            "previews": {
                "7700": {
                    "lines": ["pnpm test", "pass"],
                    "lastUpdatedMs": 1777800000000,
                    "lastChangedMs": 1777799999000,
                    "status": "active"
                },
                "7701": {
                    "lines": [],
                    "lastUpdatedMs": 1777800001000,
                    "lastChangedMs": null,
                    "status": "unavailable"
                }
            }
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(SessionPreviewsResponse.self, from: json)
        XCTAssertEqual(response.previews.count, 2)
        XCTAssertEqual(response.previewsByPort[7700]?.latestLine, "pass")
        XCTAssertEqual(response.previewsByPort[7700]?.status, .active)
        XCTAssertEqual(response.previewsByPort[7700]?.status.displayName, "Active")
        XCTAssertEqual(response.previewsByPort[7700]?.status.accessibilityName, "active")
        XCTAssertEqual(response.previewsByPort[7701]?.status, .unavailable)
        XCTAssertEqual(response.previewsByPort[7701]?.status.displayName, "Unavailable")
        XCTAssertEqual(response.previewsByPort[7701]?.status.accessibilityName, "preview unavailable")
    }

    private func loadFixtureData(_ name: String) throws -> Data {
        let testFile = URL(fileURLWithPath: #filePath)
        let fixtureURL = testFile
            .deletingLastPathComponent()
            .appendingPathComponent("Fixtures")
            .appendingPathComponent("\(name).json")
        return try Data(contentsOf: fixtureURL)
    }

    // MARK: - GitHubAccessibleRepo

    func testGitHubAccessibleRepoDecoding() throws {
        let json = """
        {
            "owner": "neonwatty",
            "name": "blog",
            "private": true,
            "pushed_at": "2026-04-25T12:00:00Z"
        }
        """.data(using: .utf8)!

        let repo = try decoder.decode(GitHubAccessibleRepo.self, from: json)
        XCTAssertEqual(repo.owner, "neonwatty")
        XCTAssertEqual(repo.name, "blog")
        XCTAssertTrue(repo.`private`)
        XCTAssertEqual(repo.pushedAt, "2026-04-25T12:00:00Z")
        XCTAssertEqual(repo.id, "neonwatty/blog")
        XCTAssertEqual(repo.fullName, "neonwatty/blog")
    }

    func testGitHubAccessibleReposResponseDecoding() throws {
        let json = """
        {
            "repos": [
                {"owner": "a", "name": "b", "private": false, "pushed_at": null}
            ],
            "synced_at": 1714200000,
            "is_stale": false
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(GitHubAccessibleReposResponse.self, from: json)
        XCTAssertEqual(response.repos.count, 1)
        XCTAssertNil(response.repos[0].pushedAt)
        XCTAssertEqual(response.syncedAt, 1714200000)
        XCTAssertFalse(response.isStale)
    }

    func testGitHubAccessibleReposResponseNullSyncedAt() throws {
        let json = """
        {
            "repos": [],
            "synced_at": null,
            "is_stale": true
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(GitHubAccessibleReposResponse.self, from: json)
        XCTAssertNil(response.syncedAt)
        XCTAssertTrue(response.isStale)
    }

    // MARK: - Priority

    func testPriorityDecoding() throws {
        let highJSON = "\"high\"".data(using: .utf8)!
        let normalJSON = "\"normal\"".data(using: .utf8)!
        let lowJSON = "\"low\"".data(using: .utf8)!

        let high = try decoder.decode(Priority.self, from: highJSON)
        let normal = try decoder.decode(Priority.self, from: normalJSON)
        let low = try decoder.decode(Priority.self, from: lowJSON)

        XCTAssertEqual(high, .high)
        XCTAssertEqual(normal, .normal)
        XCTAssertEqual(low, .low)

        // Sort order: high < normal < low
        XCTAssertEqual(high.sortIndex, 0)
        XCTAssertEqual(normal.sortIndex, 1)
        XCTAssertEqual(low.sortIndex, 2)
    }

    func testPriorityResponseDecoding() throws {
        let json = """
        {"priority": "high"}
        """.data(using: .utf8)!

        let response = try decoder.decode(PriorityResponse.self, from: json)
        XCTAssertEqual(response.priority, .high)
    }

    func testPrioritiesListResponseDecoding() throws {
        let json = """
        {
            "priorities": [
                {"repo_id": 1, "issue_number": 10, "priority": "high", "updated_at": 1714200000},
                {"repo_id": 1, "issue_number": 20, "priority": "low", "updated_at": 1714200001}
            ]
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(PrioritiesListResponse.self, from: json)
        XCTAssertEqual(response.priorities.count, 2)
        XCTAssertEqual(response.priorities[0].priority, .high)
        XCTAssertEqual(response.priorities[1].priority, .low)
    }

    // MARK: - Draft

    func testDraftDecoding() throws {
        let json = """
        {
            "id": "draft-abc123",
            "title": "New feature idea",
            "body": "Description of the feature",
            "priority": "normal",
            "created_at": 1714200000.0
        }
        """.data(using: .utf8)!

        let draft = try decoder.decode(Draft.self, from: json)
        XCTAssertEqual(draft.id, "draft-abc123")
        XCTAssertEqual(draft.title, "New feature idea")
        XCTAssertEqual(draft.body, "Description of the feature")
        XCTAssertEqual(draft.priority, .normal)
        XCTAssertEqual(draft.createdAt, 1714200000.0)
    }

    func testDraftDecodingNullOptionals() throws {
        let json = """
        {
            "id": "draft-xyz",
            "title": "Minimal draft",
            "body": null,
            "priority": null,
            "created_at": 1714200000.0
        }
        """.data(using: .utf8)!

        let draft = try decoder.decode(Draft.self, from: json)
        XCTAssertNil(draft.body)
        XCTAssertNil(draft.priority)
    }

    func testDraftsResponseDecoding() throws {
        let json = """
        {
            "drafts": [
                {"id": "d1", "title": "First", "body": null, "priority": null, "created_at": 100.0},
                {"id": "d2", "title": "Second", "body": "text", "priority": "high", "created_at": 200.0}
            ]
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(DraftsResponse.self, from: json)
        XCTAssertEqual(response.drafts.count, 2)
    }

    // MARK: - Launch/End Session responses

    func testLaunchResponseDecoding() throws {
        let json = """
        {
            "success": true,
            "correlation_id": "launch-correlation",
            "deployment_id": 99,
            "terminal_backend": "pty_bridge",
            "ttyd_port": null,
            "error": null,
            "label_warning": "Label 'priority:high' not found on repo"
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(LaunchResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.correlationId, "launch-correlation")
        XCTAssertEqual(response.deploymentId, 99)
        XCTAssertEqual(response.terminalBackend, .ptyBridge)
        XCTAssertNil(response.ttydPort)
        XCTAssertNil(response.error)
        XCTAssertEqual(response.labelWarning, "Label 'priority:high' not found on repo")

        let deployment = try XCTUnwrap(response.activeDeployment(
            repoId: 7,
            issueNumber: 123,
            agent: .codex,
            branchName: "issue-123",
            workspaceMode: .worktree,
            workspacePath: "/tmp/issue-123",
            linkedPrNumber: nil,
            launchedAt: "2026-05-31T22:00:00Z",
            owner: "mean-weasel",
            repoName: "issuectl"
        ))
        XCTAssertEqual(deployment.id, 99)
        XCTAssertEqual(deployment.correlationId, "launch-correlation")
        XCTAssertEqual(deployment.terminalBackend, .ptyBridge)
        XCTAssertNil(deployment.ttydPort)
        XCTAssertFalse(deployment.canOpenTerminalInApp)
        XCTAssertEqual(deployment.terminalMetricValue, "PTY bridge")
    }

    func testLaunchResponseFailure() throws {
        let json = """
        {
            "success": false,
            "deployment_id": null,
            "ttyd_port": null,
            "error": "Branch already exists",
            "label_warning": null
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(LaunchResponse.self, from: json)
        XCTAssertFalse(response.success)
        XCTAssertNil(response.deploymentId)
        XCTAssertEqual(response.error, "Branch already exists")
    }

    func testEndSessionResponseDecoding() throws {
        let json = """
        {"success": true, "error": null}
        """.data(using: .utf8)!

        let response = try decoder.decode(EndSessionResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertNil(response.error)
    }

    // MARK: - Merge/Review/Comment responses

    func testMergeResponseDecoding() throws {
        let json = """
        {"success": true, "sha": "abc123def456", "error": null}
        """.data(using: .utf8)!

        let response = try decoder.decode(MergeResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.sha, "abc123def456")
    }

    func testReviewResponseDecoding() throws {
        let json = """
        {"success": true, "review_id": 789, "error": null}
        """.data(using: .utf8)!

        let response = try decoder.decode(ReviewResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.reviewId, 789)
    }

    func testIssueStateResponseDecoding() throws {
        let json = """
        {"success": true, "comment_posted": true, "error": null}
        """.data(using: .utf8)!

        let response = try decoder.decode(IssueStateResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.commentPosted, true)
    }

    // MARK: - WorktreeInfo

    func testWorktreeInfoDecoding() throws {
        let json = """
        {
            "path": "/Users/dev/worktrees/issue-5",
            "name": "issue-5-fix",
            "repo": "issuectl",
            "owner": "neonwatty",
            "local_path": "/Users/dev/issuectl",
            "issue_number": 5,
            "stale": false
        }
        """.data(using: .utf8)!

        let wt = try decoder.decode(WorktreeInfo.self, from: json)
        XCTAssertEqual(wt.path, "/Users/dev/worktrees/issue-5")
        XCTAssertEqual(wt.name, "issue-5-fix")
        XCTAssertEqual(wt.repo, "issuectl")
        XCTAssertEqual(wt.owner, "neonwatty")
        XCTAssertEqual(wt.issueNumber, 5)
        XCTAssertFalse(wt.stale)
        XCTAssertEqual(wt.id, "/Users/dev/worktrees/issue-5")
        XCTAssertEqual(wt.repoFullName, "neonwatty/issuectl")
    }

    func testWorktreeInfoNullOwnerRepo() throws {
        let json = """
        {
            "path": "/tmp/orphan",
            "name": "orphan",
            "repo": null,
            "owner": null,
            "local_path": null,
            "issue_number": null,
            "stale": true
        }
        """.data(using: .utf8)!

        let wt = try decoder.decode(WorktreeInfo.self, from: json)
        XCTAssertNil(wt.repoFullName)
        XCTAssertTrue(wt.stale)
    }

    // MARK: - AssignDraftResponse

    func testAssignDraftResponseDecoding() throws {
        let json = """
        {
            "success": true,
            "issue_number": 42,
            "issue_url": "https://github.com/org/repo/issues/42",
            "cleanup_warning": null,
            "labels_warning": "Label not found",
            "error": null
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(AssignDraftResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.issueNumber, 42)
        XCTAssertEqual(response.issueUrl, "https://github.com/org/repo/issues/42")
        XCTAssertNil(response.cleanupWarning)
        XCTAssertEqual(response.labelsWarning, "Label not found")
    }

    // MARK: - ReassignResponse

    func testReassignResponseDecoding() throws {
        let json = """
        {
            "success": true,
            "new_issue_number": 15,
            "new_owner": "other-org",
            "new_repo": "other-repo",
            "cleanup_warning": "Old branch still exists",
            "error": null
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(ReassignResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.newIssueNumber, 15)
        XCTAssertEqual(response.newOwner, "other-org")
        XCTAssertEqual(response.newRepo, "other-repo")
        XCTAssertEqual(response.cleanupWarning, "Old branch still exists")
    }

    // MARK: - GitHubLabel

    func testGitHubLabelIdentifiable() throws {
        let json = """
        {"name": "enhancement", "color": "a2eeef", "description": null}
        """.data(using: .utf8)!

        let label = try decoder.decode(GitHubLabel.self, from: json)
        XCTAssertEqual(label.id, "enhancement")
        XCTAssertEqual(label.color, "a2eeef")
        XCTAssertNil(label.description)
    }

    // MARK: - PullsResponse

    func testPullsResponseDecoding() throws {
        let json = """
        {
            "pulls": [],
            "from_cache": true,
            "cached_at": "2026-04-27T00:00:00Z"
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(PullsResponse.self, from: json)
        XCTAssertTrue(response.pulls.isEmpty)
        XCTAssertTrue(response.fromCache)
        XCTAssertEqual(response.cachedAt, "2026-04-27T00:00:00Z")
    }

    // MARK: - Automation contracts

    func testEnrichedDeploymentDecodingPreservesAutomationFields() throws {
        let json = """
        {
            "id": 42,
            "repo_id": 7,
            "issue_number": null,
            "target_type": "pr",
            "target_number": 88,
            "agent": "codex",
            "terminal_backend": "pty_bridge",
            "triggered_by": "comment_command",
            "terminal_reason": "completed",
            "parent_deployment_id": 12,
            "webhook_depth": 1,
            "idle_since": null,
            "branch_name": "review/pr-88",
            "workspace_mode": "worktree",
            "workspace_path": "/tmp/issuectl/pr-88",
            "linked_pr_number": 88,
            "state": "pending",
            "launched_at": "2026-05-29T10:00:00.000Z",
            "ended_at": null,
            "completion_token": "token-redacted",
            "completion_result_json": "{\\"status\\":\\"completed\\",\\"summary\\":\\"Reviewed changes.\\"}",
            "notification_sent_at": "2026-05-29T10:05:00.000Z",
            "ttyd_port": null,
            "ttyd_pid": null,
            "owner": "org",
            "repo_name": "alpha"
        }
        """.data(using: .utf8)!

        let deployment = try decoder.decode(ActiveDeployment.self, from: json)
        XCTAssertEqual(deployment.targetType, .pr)
        XCTAssertEqual(deployment.targetNumber, 88)
        XCTAssertEqual(deployment.issueNumber, 88)
        XCTAssertEqual(deployment.state, .pending)
        XCTAssertEqual(deployment.triggeredBy, .commentCommand)
        XCTAssertEqual(deployment.parentDeploymentId, 12)
        XCTAssertEqual(deployment.completionToken, "token-redacted")
        XCTAssertEqual(deployment.completionResultJson, #"{"status":"completed","summary":"Reviewed changes."}"#)
        XCTAssertEqual(deployment.notificationSentAt, "2026-05-29T10:05:00.000Z")
    }

    func testWebhookEventDecodingFromAutomationFixture() throws {
        let json = """
        {
            "events": [
                {
                    "id": 1001,
                    "delivery_id": "delivery-1",
                    "repo_id": 7,
                    "event_type": "pull_request",
                    "action": "synchronize",
                    "sender_login": "octocat",
                    "target_type": "pr",
                    "target_number": 88,
                    "payload_json": "{\\"pull_request\\":{\\"number\\":88}}",
                    "received_at": 1777440000,
                    "intent_id": 55
                }
            ],
            "from_cache": false,
            "cached_at": null
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(WebhookEventsResponse.self, from: json)
        XCTAssertEqual(response.events.count, 1)
        XCTAssertEqual(response.events[0].repoId, 7)
        XCTAssertEqual(response.events[0].targetType, .pr)
        XCTAssertEqual(response.events[0].payloadJson, #"{"pull_request":{"number":88}}"#)
        XCTAssertFalse(response.fromCache)
    }

    func testReviewRunDecodingFromAutomationFixture() throws {
        let json = """
        {
            "review_runs": [
                {
                    "id": 55,
                    "repo_id": 7,
                    "pr_number": 88,
                    "deployment_id": 42,
                    "started_head_sha": "abc123",
                    "completed_head_sha": "def456",
                    "review_base_sha": "base999",
                    "reviewed_from_sha": "abc123",
                    "reviewed_to_sha": "def456",
                    "head_repo_full_name": "org/alpha",
                    "head_ref": "feature/review",
                    "status": "completed",
                    "triggered_by": "webhook",
                    "result_json": "{\\"summary\\":\\"No regressions\\",\\"fixedFindingCount\\":1}",
                    "started_at": 1777440000,
                    "completed_at": 1777440300,
                    "deployment": {
                        "id": 42,
                        "repo_id": 7,
                        "target_type": "pr",
                        "target_number": 88,
                        "target_label": "PR #88",
                        "issue_number": null,
                        "branch_name": "feature/review",
                        "agent": "claude",
                        "workspace_mode": "worktree",
                        "workspace_path": "/tmp/review",
                        "linked_pr_number": null,
                        "state": "active",
                        "terminal_backend": "ttyd",
                        "triggered_by": "webhook",
                        "parent_deployment_id": null,
                        "webhook_depth": 0,
                        "launched_at": "2026-05-29 02:53:42",
                        "ended_at": null,
                        "terminal_reason": null,
                        "ttyd_port": 7717,
                        "idle_since": null
                    }
                }
            ],
            "from_cache": false,
            "cached_at": null
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(ReviewRunsResponse.self, from: json)
        XCTAssertEqual(response.reviewRuns.count, 1)
        XCTAssertEqual(response.reviewRuns[0].status, .completed)
        XCTAssertEqual(response.reviewRuns[0].triggeredBy, .webhook)
        XCTAssertEqual(response.reviewRuns[0].reviewBaseSha, "base999")
        XCTAssertEqual(response.reviewRuns[0].completedHeadSha, "def456")
        XCTAssertNil(response.reviewRuns[0].deployment?.issueNumber)
    }

    func testDiagnosticEventDecodingFromAutomationFixture() throws {
        let json = """
        {
            "events": [
                {
                    "id": 9001,
                    "timestamp": 1777440500,
                    "level": "warn",
                    "event": "agent.mutation_denied",
                    "source": "agent.mutation",
                    "correlation_id": "corr-1",
                    "owner": "org",
                    "repo": "alpha",
                    "issue_number": null,
                    "target_type": "pr",
                    "target_number": 88,
                    "deployment_id": 42,
                    "session_name": "issuectl-42",
                    "ttyd_port": null,
                    "ttyd_pid": null,
                    "status": "invalid_token",
                    "message": "Agent mutation denied: invalid_token",
                    "data": {
                        "actionType": "push",
                        "targetType": "pr",
                        "targetNumber": 88
                    }
                }
            ],
            "from_cache": false,
            "cached_at": null
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(DiagnosticsResponse.self, from: json)
        XCTAssertEqual(response.events.count, 1)
        XCTAssertEqual(response.events[0].level, .warn)
        XCTAssertEqual(response.events[0].targetType, .pr)
        XCTAssertEqual(response.events[0].data?["actionType"], .string("push"))
    }

    func testDeploymentDiagnosticsResponseDecodingFromLiveContract() throws {
        let json = """
        {
          "events": [
            {
              "id": 101,
              "timestamp": 1780000000000,
              "timestamp_iso": "2026-05-29T20:26:40.000Z",
              "level": "info",
              "event": "deployment.activated",
              "message": "Deployment activated",
              "deployment_id": 42,
              "issue_number": 560,
              "target_type": "issue",
              "target_number": 560,
              "target_label": "Issue #560",
              "metadata": {"ttydPort": 49152}
            }
          ],
          "filters": {
            "deployment_id": 42,
            "target_type": null,
            "target_number": null,
            "limit": 50
          },
          "summary": {
            "count": 1,
            "level_counts": {"info": 1},
            "latest_timestamp": 1780000000000,
            "latest_timestamp_iso": "2026-05-29T20:26:40.000Z"
          }
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(DeploymentDiagnosticsResponse.self, from: json)
        XCTAssertEqual(response.events.count, 1)
        XCTAssertEqual(response.events[0].deploymentId, 42)
        XCTAssertEqual(response.events[0].event, "deployment.activated")
        XCTAssertEqual(response.events[0].targetLabel, "Issue #560")
        XCTAssertEqual(response.summary?.levelCounts["info"], 1)
    }

    func testWebhookEventsResponseDecodingFromLiveContract() throws {
        let json = """
        {
          "events": [
            {
              "id": 7,
              "delivery_id": "delivery-1",
              "repo_id": 1,
              "repo_full_name": "mean-weasel/issuectl",
              "owner": "mean-weasel",
              "repo_name": "issuectl",
              "event_type": "issues",
              "action": "labeled",
              "sender_login": "neonwatty",
              "target_type": "issue",
              "target_number": 560,
              "target_label": "Issue #560",
              "received_at": 1780000001000,
              "received_at_iso": "2026-05-29T20:26:41.000Z",
              "intent_id": 9,
              "result": "accepted",
              "result_detail": "queued",
              "action_id": "auto-session",
              "intent": {
                "id": 9,
                "status": "scheduled",
                "target_type": "issue",
                "target_number": 560,
                "target_label": "Issue #560",
                "first_signal_at": 1780000001000,
                "first_signal_at_iso": "2026-05-29T20:26:41.000Z",
                "last_signal_at": 1780000001000,
                "last_signal_at_iso": "2026-05-29T20:26:41.000Z",
                "scheduled_at": 1780000002000,
                "scheduled_at_iso": "2026-05-29T20:26:42.000Z",
                "processing_started_at": null,
                "processing_started_at_iso": null,
                "lease_expires_at": null,
                "lease_expires_at_iso": null,
                "resolved_at": null,
                "resolved_at_iso": null,
                "generation": 1,
                "requested_agent": "codex",
                "review_mode": null,
                "signal_count": 1,
                "deployment_id": null,
                "failure_reason": null
              }
            }
          ],
          "repos": [{"id": 1, "full_name": "mean-weasel/issuectl"}],
          "filters": {"repo": "mean-weasel/issuectl", "target_type": "issue", "target_number": 560, "limit": 50},
          "summary": {
            "count": 1,
            "latest_received_at": 1780000001000,
            "latest_received_at_iso": "2026-05-29T20:26:41.000Z",
            "result_counts": {"accepted": 1}
          },
          "from_cache": false,
          "cached_at": null
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(WebhookEventsResponse.self, from: json)
        XCTAssertEqual(response.events.first?.targetNumber, 560)
        XCTAssertEqual(response.events.first?.intent?.requestedAgent, "codex")
        XCTAssertEqual(response.summary?.resultCounts["accepted"], 1)
    }

    func testReviewRunsResponseDecodingFromLiveContract() throws {
        let json = """
        {
          "review_runs": [
            {
              "id": 33,
              "repo_id": 1,
              "repo_full_name": "mean-weasel/issuectl",
              "owner": "mean-weasel",
              "repo_name": "issuectl",
              "pr_number": 563,
              "deployment_id": 42,
              "started_head_sha": "abcdef123456",
              "completed_head_sha": "abcdef123456",
              "review_base_sha": "1111111",
              "reviewed_from_sha": "2222222",
              "reviewed_to_sha": "abcdef123456",
              "head_repo_full_name": "mean-weasel/issuectl",
              "head_ref": "codex/ios-repo-automation-list-api",
              "status": "completed",
              "triggered_by": "webhook",
              "result": {"summary": "No issues found", "findingCount": 0},
              "summary": "No issues found",
              "finding_count": 0,
              "range_label": "2222222..abcdef1",
              "detail_href": "/reviews/33",
              "started_at": 1780000003000,
              "started_at_iso": "2026-05-29T20:26:43.000Z",
              "completed_at": 1780000004000,
              "completed_at_iso": "2026-05-29T20:26:44.000Z",
              "deployment": null
            }
          ],
          "from_cache": false,
          "cached_at": null
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(ReviewRunsResponse.self, from: json)
        XCTAssertEqual(response.reviewRuns.count, 1)
        XCTAssertEqual(response.reviewRuns[0].status, .completed)
        XCTAssertEqual(response.reviewRuns[0].summary, "No issues found")
        XCTAssertEqual(response.reviewRuns[0].findingCount, 0)
    }

    func testGlobalReviewRunsResponseDecodesReviewsKeyFromLiveContract() throws {
        let json = """
        {
          "reviews": [
            {
              "id": 44,
              "repo_id": 1,
              "repo_full_name": "mean-weasel/issuectl",
              "owner": "mean-weasel",
              "repo_name": "issuectl",
              "pr_number": 563,
              "deployment_id": null,
              "started_head_sha": "abcdef123456",
              "completed_head_sha": "abcdef123456",
              "review_base_sha": "1111111",
              "reviewed_from_sha": null,
              "reviewed_to_sha": "abcdef123456",
              "head_repo_full_name": "mean-weasel/issuectl",
              "head_ref": "codex/ios-global-automation-feed",
              "status": "completed",
              "triggered_by": "webhook",
              "result": {"summary": "No issues found"},
              "summary": "No issues found",
              "finding_count": 0,
              "range_label": "full abcdef1",
              "detail_href": "/reviews/44",
              "started_at": 1780000003000,
              "started_at_iso": "2026-05-29T20:26:43.000Z",
              "completed_at": 1780000004000,
              "completed_at_iso": "2026-05-29T20:26:44.000Z",
              "deployment": null
            }
          ],
          "repos": [{"id": 1, "full_name": "mean-weasel/issuectl"}],
          "filters": {"repo": null, "pr": null, "status": "all", "limit": 50},
          "summary": {
            "count": 1,
            "active_count": 0,
            "completed_count": 1,
            "failed_count": 0,
            "latest_started_at": 1780000003000,
            "latest_started_at_iso": "2026-05-29T20:26:43.000Z"
          }
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(ReviewRunsResponse.self, from: json)
        XCTAssertEqual(response.reviewRuns.count, 1)
        XCTAssertEqual(response.reviewRuns[0].repoFullName, "mean-weasel/issuectl")
        XCTAssertEqual(response.reviewRuns[0].status, .completed)
    }

    func testReviewRunDetailResponseDecodingFromLiveContract() throws {
        let json = """
        {
          "review": {
            "id": 33,
            "repo_id": 1,
            "repo_full_name": "mean-weasel/issuectl",
            "owner": "mean-weasel",
            "repo_name": "issuectl",
            "pr_number": 563,
            "deployment_id": 42,
            "started_head_sha": "abcdef123456",
            "completed_head_sha": "abcdef123456",
            "review_base_sha": "1111111",
            "reviewed_from_sha": "2222222",
            "reviewed_to_sha": "abcdef123456",
            "head_repo_full_name": "mean-weasel/issuectl",
            "head_ref": "codex/ios-review-detail-parity",
            "status": "completed",
            "triggered_by": "webhook",
            "result": {"summary": "No issues found", "findingCount": 0},
            "summary": "No issues found",
            "finding_count": 0,
            "range_label": "2222222..abcdef1",
            "detail_href": "/reviews/33",
            "started_at": 1780000003000,
            "started_at_iso": "2026-05-29T20:26:43.000Z",
            "completed_at": 1780000004000,
            "completed_at_iso": "2026-05-29T20:26:44.000Z",
            "deployment": null
          },
          "repo": {"id": 1, "full_name": "mean-weasel/issuectl", "owner": "mean-weasel", "name": "issuectl"},
          "deployment": null,
          "lineage": [
            {
              "id": 33,
              "active": true,
              "label": "2222222..abcdef1",
              "status": "completed",
              "triggered_by": "webhook",
              "deployment_id": 42,
              "reviewed_from_sha": "2222222",
              "reviewed_to_sha": "abcdef123456",
              "result": {"summary": "No issues found"},
              "summary": "No issues found",
              "started_at": 1780000003000,
              "started_at_iso": "2026-05-29T20:26:43.000Z",
              "completed_at": 1780000004000,
              "completed_at_iso": "2026-05-29T20:26:44.000Z"
            }
          ],
          "diagnostics": {
            "events": [
              {
                "id": 52,
                "timestamp": 1780000003000,
                "timestamp_iso": "2026-05-29T20:26:43.000Z",
                "level": "info",
                "event": "webhook.pr_launched",
                "target_type": "pr",
                "target_number": 563,
                "target_label": "PR #563",
                "deployment_id": 42,
                "message": "Review launched"
              }
            ],
            "filters": {"deployment_id": null, "target_type": "pr", "target_number": 563, "limit": 1},
            "summary": {"count": 1, "level_counts": {"info": 1}, "latest_timestamp": 1780000003000, "latest_timestamp_iso": "2026-05-29T20:26:43.000Z"}
          },
          "findings": [
            {
              "id": "Sources/App.swift-42",
              "title": "Nil branch is not handled",
              "body": "Guard the optional value before rendering.",
              "path": "Sources/App.swift",
              "line": 42,
              "severity": "warning",
              "html_url": "https://github.com/mean-weasel/issuectl/pull/563/files#diff-app"
            }
          ],
          "banners": [{"tone": "info", "title": "Follow-up requested", "body": "A newer PR head was coalesced."}],
          "metadata": {
            "current_review_preamble": null,
            "trigger_event": {
              "id": 52,
              "timestamp": 1780000003000,
              "level": "info",
              "event": "webhook.pr_launched",
              "target_type": "pr",
              "target_number": 563,
              "target_label": "PR #563"
            }
          },
          "actions": {"can_retry": true, "can_full_rerun": true, "disabled_reason": null, "mobile_write_actions_enabled": true},
          "links": {
            "github_pr": "https://github.com/mean-weasel/issuectl/pull/563",
            "github_review": null,
            "github_review_files": "https://github.com/mean-weasel/issuectl/pull/563/files",
            "workbench": "/workbench?repo=mean-weasel%2Fissuectl",
            "repo_settings": "/repos/mean-weasel/issuectl/settings",
            "sessions": "/sessions?tab=reviews",
            "webhook_logs": "/logs/webhooks",
            "diagnostics_cli": "pnpm --dir packages/cli exec issuectl diag show --pr mean-weasel/issuectl#563"
          }
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(ReviewRunDetailResponse.self, from: json)
        XCTAssertEqual(response.review.id, 33)
        XCTAssertEqual(response.repo.fullName, "mean-weasel/issuectl")
        XCTAssertEqual(response.lineage.first?.active, true)
        XCTAssertEqual(response.diagnostics.summaryText, "1 diagnostic event, no failure recorded")
        XCTAssertEqual(response.diagnostics.events.first?.targetLabel, "PR #563")
        XCTAssertEqual(response.findings.first?.locationLabel, "Sources/App.swift:42")
        XCTAssertEqual(response.findings.first?.title, "Nil branch is not handled")
        XCTAssertEqual(response.banners.first?.tone, .info)
        XCTAssertTrue(response.actions.mobileWriteActionsEnabled)
        XCTAssertEqual(response.links.githubPr, "https://github.com/mean-weasel/issuectl/pull/563")
    }

    func testSessionsOverviewResponseDecodingFromLiveContract() throws {
        let json = """
        {
          "overview": {
            "initialized": true,
            "filters": {
              "tab": "reviews",
              "q": "PR #563",
              "repo": "mean-weasel/issuectl",
              "trigger": "webhook",
              "state": "all",
              "status": "completed"
            },
            "repos": [{"id": 1, "full_name": "mean-weasel/issuectl"}],
            "session_groups": [
              {
                "key": "1:pr:563",
                "repo_full_name": "mean-weasel/issuectl",
                "target_type": "pr",
                "target_number": 563,
                "target_label": "PR #563",
                "matching_session_count": 1,
                "sessions": [
                  {
                    "id": 42,
                    "repo_id": 1,
                    "repo_full_name": "mean-weasel/issuectl",
                    "owner": "mean-weasel",
                    "repo_name": "issuectl",
                    "target_type": "pr",
                    "target_number": 563,
                    "target_label": "PR #563",
                    "issue_number": null,
                    "branch_name": "pr-563-review",
                    "agent": "codex",
                    "workspace_mode": "worktree",
                    "workspace_path": "/tmp/review",
                    "linked_pr_number": null,
                    "triggered_by": "webhook",
                    "parent_deployment_id": null,
                    "child_deployment_count": 0,
                    "webhook_depth": 0,
                    "terminal_reason": "review",
                    "terminal_backend": "pty_bridge",
                    "launched_at": "2026-05-29 20:26:43",
                    "ended_at": null,
                    "ttyd_port": null,
                    "idle_since": null,
                    "preview": null,
                    "provenance_label": "webhook · root session",
                    "elapsed_label": "5m"
                  }
                ]
              }
            ],
            "review_groups": [
              {
                "key": "1:563",
                "repo_full_name": "mean-weasel/issuectl",
                "owner": "mean-weasel",
                "repo_name": "issuectl",
                "pr_number": 563,
                "matching_run_count": 1,
                "runs": [
                  {
                    "id": 33,
                    "repo_id": 1,
                    "repo_full_name": "mean-weasel/issuectl",
                    "owner": "mean-weasel",
                    "repo_name": "issuectl",
                    "pr_number": 563,
                    "deployment_id": 42,
                    "started_head_sha": "abcdef123456",
                    "completed_head_sha": "abcdef123456",
                    "review_base_sha": "1111111",
                    "reviewed_from_sha": "2222222",
                    "reviewed_to_sha": "abcdef123456",
                    "head_repo_full_name": "mean-weasel/issuectl",
                    "head_ref": "codex/ios-repo-automation-list-api",
                    "status": "completed",
                    "triggered_by": "webhook",
                    "result": {"summary": "No issues found", "findingCount": 0},
                    "result_json": "{\\"summary\\":\\"No issues found\\"}",
                    "summary": "No issues found",
                    "finding_count": 0,
                    "range_label": "2222222..abcdef1",
                    "detail_href": "/reviews/33",
                    "provenance_label": "webhook · session #42",
                    "elapsed_label": "1m",
                    "started_at": 1780000003000,
                    "completed_at": 1780000004000,
                    "deployment": null
                  }
                ]
              }
            ],
            "summary": {"active_sessions": 1, "ended_sessions": 1, "review_runs": 1, "active_review_runs": 0}
          },
          "diagnostics": {
            "events": [],
            "filters": {"deployment_id": null, "target_type": "pr", "target_number": 563, "limit": 20},
            "summary": {"count": 0, "level_counts": {}, "latest_timestamp": null, "latest_timestamp_iso": null}
          },
          "generated_at": "2026-05-30T00:00:00.000Z"
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(SessionsOverviewResponse.self, from: json)
        XCTAssertEqual(response.overview.filters.tab, .reviews)
        XCTAssertEqual(response.overview.filters.trigger, .webhook)
        XCTAssertEqual(response.overview.summary.endedSessions, 1)
        XCTAssertEqual(response.overview.sessionGroups.first?.sessions.first?.sessionRoleTitle, "PR review session")
        XCTAssertEqual(response.overview.sessionGroups.first?.sessions.first?.durationLabel, "5m")
        XCTAssertEqual(response.overview.sessionGroups.first?.sessions.first?.terminalBackend, .ptyBridge)
        XCTAssertEqual(response.overview.sessionGroups.first?.sessions.first?.terminalMetricValue, "PTY bridge")
        XCTAssertFalse(response.overview.sessionGroups.first?.sessions.first?.canOpenTerminalInApp ?? true)
        XCTAssertEqual(response.overview.sessionGroups.first?.sessions.first?.activeDeployment.terminalBackend, .ptyBridge)
        XCTAssertEqual(response.overview.reviewGroups.first?.runs.first?.statusLabel, "Completed")
        XCTAssertEqual(response.diagnostics?.filters?.targetNumber, 563)
    }
}
