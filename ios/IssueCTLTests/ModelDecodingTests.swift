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
                "html_url": "https://example.com/42"
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
        XCTAssertNotNil(deployment.launchedDate)
        XCTAssertFalse(deployment.runningDuration.isEmpty)
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
                }
            ]
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(ActiveDeploymentsResponse.self, from: json)
        XCTAssertEqual(response.deployments.count, 1)
        XCTAssertEqual(response.deployments[0].repoFullName, "org/app")
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
            "deployment_id": 99,
            "ttyd_port": 7682,
            "error": null,
            "label_warning": "Label 'priority:high' not found on repo"
        }
        """.data(using: .utf8)!

        let response = try decoder.decode(LaunchResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.deploymentId, 99)
        XCTAssertEqual(response.ttydPort, 7682)
        XCTAssertNil(response.error)
        XCTAssertEqual(response.labelWarning, "Label 'priority:high' not found on repo")
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
}
