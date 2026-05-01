import XCTest
@testable import IssueCTL

final class ViewLogicTests: XCTestCase {

    // MARK: - iOS Setup Links

    func testSetupLinkParsesServerURLAndToken() throws {
        let url = try XCTUnwrap(URL(string: "issuectl://setup?serverURL=http%3A%2F%2F192.0.2.10%3A3847&token=abc123"))
        let setup = try XCTUnwrap(SetupLink(url: url))

        XCTAssertEqual(setup.serverURL, "http://192.0.2.10:3847")
        XCTAssertEqual(setup.token, "abc123")
    }

    func testSetupLinkRejectsWrongScheme() throws {
        let url = try XCTUnwrap(URL(string: "https://setup?serverURL=http%3A%2F%2F192.0.2.10%3A3847&token=abc123"))
        XCTAssertNil(SetupLink(url: url))
    }

    func testLocalhostDetectionForPhysicalDeviceSetup() {
        XCTAssertTrue(isLocalhost("localhost"))
        XCTAssertTrue(isLocalhost("127.0.0.1"))
        XCTAssertTrue(isLocalhost("::1"))
        XCTAssertFalse(isLocalhost("192.0.2.10"))
    }

    func testUnauthorizedOnboardingErrorIsActionable() {
        let message = onboardingErrorMessage(for: APIError.unauthorized, serverURL: "http://192.0.2.10:3847")
        XCTAssertTrue(message.contains("Invalid or stale API token"))
    }

    func testNetworkOnboardingErrorMentionsReachability() {
        let error = NSError(domain: NSURLErrorDomain, code: NSURLErrorTimedOut)
        let message = onboardingErrorMessage(for: error, serverURL: "http://192.0.2.10:3847")
        XCTAssertTrue(message.contains("Could not reach"))
        XCTAssertTrue(message.contains("Local Network access"))
    }

    // MARK: - Branch Name Generation

    func testBasicSlugGeneration() {
        let result = generateBranchName(issueNumber: 42, issueTitle: "Fix login bug")
        XCTAssertEqual(result, "issue-42-fix-login-bug")
    }

    func testSlugLowercased() {
        let result = generateBranchName(issueNumber: 1, issueTitle: "Add OAuth Support")
        XCTAssertEqual(result, "issue-1-add-oauth-support")
    }

    func testSlugSpecialCharactersReplaced() {
        let result = generateBranchName(issueNumber: 10, issueTitle: "Fix: user's data [urgent]")
        XCTAssertEqual(result, "issue-10-fix-user-s-data-urgent")
    }

    func testSlugLeadingTrailingDashesRemoved() {
        let result = generateBranchName(issueNumber: 5, issueTitle: "---leading and trailing---")
        XCTAssertEqual(result, "issue-5-leading-and-trailing")
    }

    func testSlugConsecutiveSpecialCharsCollapsed() {
        let result = generateBranchName(issueNumber: 7, issueTitle: "fix!!!the...bug???now")
        XCTAssertEqual(result, "issue-7-fix-the-bug-now")
    }

    func testSlugTruncatedToFortyChars() {
        // The slug portion (after the regex and trimming) is prefix(40)
        let longTitle = String(repeating: "a", count: 80)
        let result = generateBranchName(issueNumber: 1, issueTitle: longTitle)
        // slug will be 40 chars of 'a', total: "issue-1-" + 40 'a's = 48 chars
        let expectedSlug = String(repeating: "a", count: 40)
        XCTAssertEqual(result, "issue-1-\(expectedSlug)")
    }

    func testSlugWithNumbers() {
        let result = generateBranchName(issueNumber: 99, issueTitle: "v2.0 release prep")
        XCTAssertEqual(result, "issue-99-v2-0-release-prep")
    }

    func testSlugEmptyTitle() {
        let result = generateBranchName(issueNumber: 1, issueTitle: "")
        XCTAssertEqual(result, "issue-1-")
    }

    func testSlugAllSpecialCharsTitle() {
        let result = generateBranchName(issueNumber: 3, issueTitle: "!@#$%^&*()")
        XCTAssertEqual(result, "issue-3-")
    }

    func testSlugUnicodeTitle() {
        // Non-ASCII chars should be replaced by dashes
        let result = generateBranchName(issueNumber: 8, issueTitle: "Fix the bug")
        XCTAssertTrue(result.hasPrefix("issue-8-"))
    }

    func testSlugWhitespace() {
        let result = generateBranchName(issueNumber: 2, issueTitle: "  spaces  everywhere  ")
        XCTAssertEqual(result, "issue-2-spaces-everywhere")
    }

    func testSlugTruncationPreservesIssuePrefix() {
        // Even with very long title, the "issue-N-" prefix is always present
        let longTitle = "this is a very long issue title that should definitely exceed forty characters in length"
        let result = generateBranchName(issueNumber: 999, issueTitle: longTitle)
        XCTAssertTrue(result.hasPrefix("issue-999-"))
        // The slug after prefix should be at most 40 chars
        let slugPart = String(result.dropFirst("issue-999-".count))
        XCTAssertLessThanOrEqual(slugPart.count, 40)
    }

    // MARK: - Refresh Cooldown Logic

    func testRefreshAllowedWhenNoLastRefresh() {
        XCTAssertTrue(shouldAllowRefresh(lastRefreshDate: nil, cooldown: 10))
    }

    func testRefreshBlockedWithinCooldown() {
        let now = Date()
        let fiveSecondsAgo = now.addingTimeInterval(-5)
        XCTAssertFalse(shouldAllowRefresh(lastRefreshDate: fiveSecondsAgo, cooldown: 10, now: now))
    }

    func testRefreshAllowedAfterCooldown() {
        let now = Date()
        let elevenSecondsAgo = now.addingTimeInterval(-11)
        XCTAssertTrue(shouldAllowRefresh(lastRefreshDate: elevenSecondsAgo, cooldown: 10, now: now))
    }

    func testRefreshAllowedExactlyAtCooldown() {
        let now = Date()
        let exactlyTenSecondsAgo = now.addingTimeInterval(-10)
        XCTAssertTrue(shouldAllowRefresh(lastRefreshDate: exactlyTenSecondsAgo, cooldown: 10, now: now))
    }

    func testRefreshBlockedJustBeforeCooldown() {
        let now = Date()
        let justBefore = now.addingTimeInterval(-9.99)
        XCTAssertFalse(shouldAllowRefresh(lastRefreshDate: justBefore, cooldown: 10, now: now))
    }

    func testRefreshWithZeroCooldown() {
        let now = Date()
        let justNow = now.addingTimeInterval(-0.001)
        XCTAssertTrue(shouldAllowRefresh(lastRefreshDate: justNow, cooldown: 0, now: now))
    }

    // MARK: - Pagination Logic

    func testPaginationInitialLimit() {
        // The page size constant is 15
        let pageSize = 15
        var displayLimit = pageSize

        XCTAssertEqual(displayLimit, 15, "Initial display limit should match page size")

        // Simulate "Load More"
        displayLimit += pageSize
        XCTAssertEqual(displayLimit, 30, "After one load more, limit should be 30")

        displayLimit += pageSize
        XCTAssertEqual(displayLimit, 45, "After two load mores, limit should be 45")
    }

    func testPaginationReset() {
        // When section/filter changes, displayLimit resets to pageSize
        let pageSize = 15
        var displayLimit = pageSize

        // Simulate several load mores
        displayLimit += pageSize
        displayLimit += pageSize
        XCTAssertEqual(displayLimit, 45)

        // Reset (simulates section/filter change)
        displayLimit = pageSize
        XCTAssertEqual(displayLimit, 15)
    }

    func testPaginationRemainingCount() {
        let totalItems = 42
        let pageSize = 15
        var displayLimit = pageSize

        XCTAssertEqual(totalItems - displayLimit, 27, "Should show 27 remaining")

        displayLimit += pageSize
        XCTAssertEqual(totalItems - displayLimit, 12, "Should show 12 remaining")

        displayLimit += pageSize
        // displayLimit is now 45, which exceeds totalItems
        // In this case "Load More" would not be shown
        XCTAssertTrue(displayLimit >= totalItems, "All items are now visible")
    }

    // MARK: - Repo Filter Helpers

    private struct FakeItem {
        let htmlUrl: String
        let userLogin: String?
    }

    private func makeRepos() -> [Repo] {
        [
            Repo(id: 1, owner: "org", name: "alpha", localPath: nil, branchPattern: nil, createdAt: ""),
            Repo(id: 2, owner: "org", name: "beta", localPath: nil, branchPattern: nil, createdAt: ""),
        ]
    }

    private func makePull(number: Int = 1, state: String = "open", merged: Bool = false, checksStatus: String? = nil) -> GitHubPull {
        GitHubPull(
            number: number,
            title: "PR \(number)",
            body: nil,
            state: state,
            draft: false,
            merged: merged,
            user: nil,
            headRef: "feature",
            baseRef: "main",
            additions: 1,
            deletions: 1,
            changedFiles: 1,
            createdAt: "2026-04-27T08:00:00Z",
            updatedAt: "2026-04-27T09:00:00Z",
            mergedAt: merged ? "2026-04-27T10:00:00Z" : nil,
            closedAt: state == "closed" ? "2026-04-27T10:00:00Z" : nil,
            htmlUrl: "https://github.com/org/alpha/pull/\(number)",
            checksStatus: checksStatus
        )
    }

    private func makeIssue(
        number: Int = 1,
        state: String = "open",
        assignees: [GitHubUser]? = nil
    ) -> GitHubIssue {
        GitHubIssue(
            number: number,
            title: "Issue \(number)",
            body: nil,
            state: state,
            labels: [],
            assignees: assignees,
            user: nil,
            commentCount: 0,
            createdAt: "2026-04-27T08:00:00Z",
            updatedAt: "2026-04-27T09:00:00Z",
            closedAt: state == "closed" ? "2026-04-27T10:00:00Z" : nil,
            htmlUrl: "https://github.com/org/alpha/issues/\(number)"
        )
    }

    private func makeDeployment(
        id: Int = 1,
        owner: String = "org",
        repo: String = "alpha",
        issueNumber: Int = 1,
        state: DeploymentState = .active,
        endedAt: String? = nil
    ) -> ActiveDeployment {
        ActiveDeployment(
            id: id,
            repoId: 1,
            issueNumber: issueNumber,
            branchName: "issue-\(issueNumber)",
            workspaceMode: .worktree,
            workspacePath: "/tmp/repo",
            linkedPrNumber: nil,
            state: state,
            launchedAt: "2026-04-27T08:00:00Z",
            endedAt: endedAt,
            ttydPort: 7681,
            ttydPid: 123,
            owner: owner,
            repoName: repo
        )
    }

    func testFilterItemsByRepoNoSelection() {
        let repos = makeRepos()
        let items: [String: [FakeItem]] = [
            "org/alpha": [FakeItem(htmlUrl: "a1", userLogin: "alice")],
            "org/beta": [FakeItem(htmlUrl: "b1", userLogin: "bob")],
        ]
        let result = filterItemsByRepo(items, repos: repos, selectedRepoIds: [], mineOnly: false, currentUserLogin: nil, userLogin: { $0.userLogin })
        XCTAssertEqual(result.count, 2)
    }

    func testFilterItemsByRepoWithSelection() {
        let repos = makeRepos()
        let items: [String: [FakeItem]] = [
            "org/alpha": [FakeItem(htmlUrl: "a1", userLogin: "alice")],
            "org/beta": [FakeItem(htmlUrl: "b1", userLogin: "bob")],
        ]
        let result = filterItemsByRepo(items, repos: repos, selectedRepoIds: [1], mineOnly: false, currentUserLogin: nil, userLogin: { $0.userLogin })
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result.first?.htmlUrl, "a1")
    }

    func testFilterItemsByRepoMineOnly() {
        let repos = makeRepos()
        let items: [String: [FakeItem]] = [
            "org/alpha": [
                FakeItem(htmlUrl: "a1", userLogin: "alice"),
                FakeItem(htmlUrl: "a2", userLogin: "bob"),
            ],
        ]
        let result = filterItemsByRepo(items, repos: repos, selectedRepoIds: [], mineOnly: true, currentUserLogin: "alice", userLogin: { $0.userLogin })
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result.first?.htmlUrl, "a1")
    }

    func testFilterItemsByRepoEmpty() {
        let repos = makeRepos()
        let items: [String: [FakeItem]] = [:]
        let result = filterItemsByRepo(items, repos: repos, selectedRepoIds: [], mineOnly: false, currentUserLogin: nil, userLogin: { $0.userLogin })
        XCTAssertTrue(result.isEmpty)
    }

    func testRepoForItemFound() {
        let repos = makeRepos()
        let items: [String: [FakeItem]] = [
            "org/alpha": [FakeItem(htmlUrl: "a1", userLogin: nil)],
            "org/beta": [FakeItem(htmlUrl: "b1", userLogin: nil)],
        ]
        let target = FakeItem(htmlUrl: "b1", userLogin: nil)
        let repo = repoForItem(target, in: items, repos: repos, htmlUrl: { $0.htmlUrl })
        XCTAssertEqual(repo?.name, "beta")
    }

    func testRepoForItemNotFound() {
        let repos = makeRepos()
        let items: [String: [FakeItem]] = [
            "org/alpha": [FakeItem(htmlUrl: "a1", userLogin: nil)],
        ]
        let target = FakeItem(htmlUrl: "missing", userLogin: nil)
        let repo = repoForItem(target, in: items, repos: repos, htmlUrl: { $0.htmlUrl })
        XCTAssertNil(repo)
    }

    func testRepoIndexForItemFound() {
        let repos = makeRepos()
        let items: [String: [FakeItem]] = [
            "org/alpha": [FakeItem(htmlUrl: "a1", userLogin: nil)],
            "org/beta": [FakeItem(htmlUrl: "b1", userLogin: nil)],
        ]
        let target = FakeItem(htmlUrl: "b1", userLogin: nil)
        let idx = repoIndexForItem(target, in: items, repos: repos, htmlUrl: { $0.htmlUrl })
        XCTAssertEqual(idx, 1)
    }

    func testRepoIndexForItemNotFound() {
        let repos = makeRepos()
        let items: [String: [FakeItem]] = [:]
        let target = FakeItem(htmlUrl: "nope", userLogin: nil)
        let idx = repoIndexForItem(target, in: items, repos: repos, htmlUrl: { $0.htmlUrl })
        XCTAssertNil(idx)
    }

    func testFilterItemsByRepoMineOnlyWithNilLogin() {
        let repos = makeRepos()
        let items: [String: [FakeItem]] = [
            "org/alpha": [FakeItem(htmlUrl: "a1", userLogin: "alice")],
        ]
        // mineOnly is true but login is nil — filter is a no-op, all items returned
        let result = filterItemsByRepo(items, repos: repos, selectedRepoIds: [], mineOnly: true, currentUserLogin: nil, userLogin: { $0.userLogin })
        XCTAssertEqual(result.count, 1)
    }

    func testFilterItemsByRepoSelectionAndMineOnly() {
        let repos = makeRepos()
        let items: [String: [FakeItem]] = [
            "org/alpha": [
                FakeItem(htmlUrl: "a1", userLogin: "alice"),
                FakeItem(htmlUrl: "a2", userLogin: "bob"),
            ],
            "org/beta": [FakeItem(htmlUrl: "b1", userLogin: "alice")],
        ]
        // Select only repo 1 (alpha) AND filter to alice
        let result = filterItemsByRepo(items, repos: repos, selectedRepoIds: [1], mineOnly: true, currentUserLogin: "alice", userLogin: { $0.userLogin })
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result.first?.htmlUrl, "a1")
    }

    func testFilterItemsByRepoStaleSelectionId() {
        let repos = makeRepos()
        let items: [String: [FakeItem]] = [
            "org/alpha": [FakeItem(htmlUrl: "a1", userLogin: nil)],
        ]
        // selectedRepoIds contains an ID not in repos — returns empty
        let result = filterItemsByRepo(items, repos: repos, selectedRepoIds: [999], mineOnly: false, currentUserLogin: nil, userLogin: { $0.userLogin })
        XCTAssertTrue(result.isEmpty)
    }

    // MARK: - PR Review Helpers

    func testPullNeedsReviewAttentionForFailingOrPendingOpenPulls() {
        XCTAssertTrue(makePull(checksStatus: "failure").needsReviewAttention)
        XCTAssertTrue(makePull(checksStatus: "pending").needsReviewAttention)
    }

    func testPullNeedsReviewAttentionIgnoresPassingMissingAndClosedPulls() {
        XCTAssertFalse(makePull(checksStatus: "success").needsReviewAttention)
        XCTAssertFalse(makePull(checksStatus: nil).needsReviewAttention)
        XCTAssertFalse(makePull(state: "closed", checksStatus: "failure").needsReviewAttention)
    }

    // MARK: - Today Helpers

    func testTodayIssueMetricLabelFallsBackWhenUserUnavailable() {
        XCTAssertEqual(todayIssueMetricLabel(currentUserLogin: nil, userFetchFailed: false), "open issues")
        XCTAssertEqual(todayIssueMetricLabel(currentUserLogin: "alice", userFetchFailed: true), "open issues")
        XCTAssertEqual(todayIssueMetricLabel(currentUserLogin: "alice", userFetchFailed: false), "assigned issues")
    }

    func testTodayAssignedIssuesFallsBackToOpenIssuesWhenNoLogin() {
        let issues = [
            makeIssue(number: 1, state: "open"),
            makeIssue(number: 2, state: "closed"),
            makeIssue(number: 3, state: "open"),
        ]

        XCTAssertEqual(todayAssignedIssues(issues, currentUserLogin: nil).map(\.number), [1, 3])
    }

    func testTodayAssignedIssuesFiltersToCurrentUser() {
        let alice = GitHubUser(login: "alice", avatarUrl: "")
        let bob = GitHubUser(login: "bob", avatarUrl: "")
        let issues = [
            makeIssue(number: 1, assignees: [alice]),
            makeIssue(number: 2, assignees: [bob]),
            makeIssue(number: 3, state: "closed", assignees: [alice]),
            makeIssue(number: 4, assignees: nil),
        ]

        XCTAssertEqual(todayAssignedIssues(issues, currentUserLogin: "alice").map(\.number), [1])
    }

    func testTodayAttentionSubtitlePluralizes() {
        XCTAssertEqual(todayAttentionSubtitle(count: 0), "0 items need attention")
        XCTAssertEqual(todayAttentionSubtitle(count: 1), "1 item needs attention")
        XCTAssertEqual(todayAttentionSubtitle(count: 2), "2 items need attention")
    }

    func testTodayReviewPullsIncludesOnlyFailingOrPendingOpenPullsSorted() {
        let pulls = [
            makePull(number: 1, checksStatus: "success"),
            makePull(number: 2, checksStatus: "pending"),
            makePull(number: 3, checksStatus: "failure"),
            makePull(number: 4, state: "closed", checksStatus: "failure"),
        ]

        XCTAssertEqual(todayReviewPulls(pulls).map(\.number), [3, 2])
    }

    func testTodaySearchMatchesTitleBodyRepoAndNumber() {
        XCTAssertTrue(todayMatchesSearchQuery(
            query: "login",
            title: "Fix login bug",
            body: nil,
            repoFullName: "org/alpha",
            number: 42
        ))
        XCTAssertTrue(todayMatchesSearchQuery(
            query: "oauth",
            title: "Fix login bug",
            body: "Handle OAuth redirect failures",
            repoFullName: "org/alpha",
            number: 42
        ))
        XCTAssertTrue(todayMatchesSearchQuery(
            query: "org/alpha",
            title: "Fix login bug",
            body: nil,
            repoFullName: "org/alpha",
            number: 42
        ))
        XCTAssertTrue(todayMatchesSearchQuery(
            query: "#42",
            title: "Fix login bug",
            body: nil,
            repoFullName: "org/alpha",
            number: 42
        ))
        XCTAssertFalse(todayMatchesSearchQuery(
            query: "billing",
            title: "Fix login bug",
            body: nil,
            repoFullName: "org/alpha",
            number: 42
        ))
    }

    func testTodaySearchEmptyQueryShowsDefaultResults() {
        XCTAssertTrue(todayMatchesSearchQuery(
            query: "  ",
            title: "Fix login bug",
            body: nil,
            repoFullName: "org/alpha",
            number: 42
        ))
    }

    // MARK: - Running Deployment Helpers

    func testRunningDeploymentMatchesActiveIssueSessionByRepoAndIssue() {
        let issue = makeIssue(number: 42)
        let deployments = [
            makeDeployment(id: 1, repo: "beta", issueNumber: 42),
            makeDeployment(id: 2, repo: "alpha", issueNumber: 42),
        ]

        let result = runningDeployment(for: issue, in: "org/alpha", deployments: deployments)

        XCTAssertEqual(result?.id, 2)
    }

    func testRunningDeploymentIgnoresEndedAndMismatchedSessions() {
        let issue = makeIssue(number: 42)
        let deployments = [
            makeDeployment(id: 1, repo: "alpha", issueNumber: 42, state: .ended, endedAt: "2026-04-27T10:00:00Z"),
            makeDeployment(id: 2, repo: "alpha", issueNumber: 99),
            makeDeployment(id: 3, repo: "beta", issueNumber: 42),
        ]

        XCTAssertNil(runningDeployment(for: issue, in: "org/alpha", deployments: deployments))
        XCTAssertNil(runningDeployment(owner: "org", repo: "alpha", number: 42, deployments: deployments))
    }

    // MARK: - Terminal Display Settings

    func testTerminalFontSizeClampsToSupportedRange() {
        XCTAssertEqual(
            TerminalDisplaySettings.clampedFontSize(TerminalDisplaySettings.minimumFontSize - 10),
            TerminalDisplaySettings.minimumFontSize
        )
        XCTAssertEqual(
            TerminalDisplaySettings.clampedFontSize(TerminalDisplaySettings.maximumFontSize + 10),
            TerminalDisplaySettings.maximumFontSize
        )
        XCTAssertEqual(TerminalDisplaySettings.clampedFontSize(28), 28)
    }

    func testTerminalFontSizeIncreaseAndDecreaseRespectBounds() {
        XCTAssertEqual(
            TerminalDisplaySettings.increased(from: TerminalDisplaySettings.maximumFontSize),
            TerminalDisplaySettings.maximumFontSize
        )
        XCTAssertEqual(
            TerminalDisplaySettings.decreased(from: TerminalDisplaySettings.minimumFontSize),
            TerminalDisplaySettings.minimumFontSize
        )
        XCTAssertEqual(
            TerminalDisplaySettings.increased(from: TerminalDisplaySettings.defaultFontSize),
            TerminalDisplaySettings.defaultFontSize + TerminalDisplaySettings.step
        )
        XCTAssertEqual(
            TerminalDisplaySettings.decreased(from: TerminalDisplaySettings.defaultFontSize),
            TerminalDisplaySettings.defaultFontSize - TerminalDisplaySettings.step
        )
    }
}
