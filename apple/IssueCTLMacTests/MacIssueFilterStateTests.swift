import XCTest
@testable import IssueCTLMac

@MainActor
final class MacIssueFilterStateTests: XCTestCase {
    private var suiteName: String!
    private var defaults: UserDefaults!

    override func setUpWithError() throws {
        try super.setUpWithError()
        suiteName = "issuectl.tests.mac-issue-filter.\(UUID().uuidString)"
        defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDownWithError() throws {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        try super.tearDownWithError()
    }

    func testInitializesAllReposWhenNoSelectionWasSaved() {
        let preferences = MacSidebarDisplayPreferences(displayKey: "display-a", defaults: defaults)
        let state = MacIssueFilterState(preferences: preferences)

        state.syncRepoSelection(repos: repos)

        XCTAssertEqual(state.selectedRepoKeys, ["mean-weasel/issuectl", "mean-weasel/other"])
        XCTAssertEqual(preferences.selectedRepoKeys, state.selectedRepoKeys)
    }

    func testPersistedRepoSelectionIsRestoredAndReconciled() {
        let preferences = MacSidebarDisplayPreferences(displayKey: "display-a", defaults: defaults)
        preferences.selectedRepoKeys = ["mean-weasel/issuectl", "missing/repo"]

        let state = MacIssueFilterState(preferences: preferences)
        state.syncRepoSelection(repos: repos)

        XCTAssertEqual(state.selectedRepoKeys, ["mean-weasel/issuectl"])
    }

    func testAllReposSelectionTracksNewRepos() {
        let preferences = MacSidebarDisplayPreferences(displayKey: "display-a", defaults: defaults)
        let state = MacIssueFilterState(preferences: preferences)

        state.syncRepoSelection(repos: [repos[0]])
        state.syncRepoSelection(repos: repos)

        XCTAssertEqual(state.selectedRepoKeys, ["mean-weasel/issuectl", "mean-weasel/other"])
    }

    func testPartialRepoSelectionStaysPartialWhenReposChange() {
        let preferences = MacSidebarDisplayPreferences(displayKey: "display-a", defaults: defaults)
        let state = MacIssueFilterState(preferences: preferences)

        state.syncRepoSelection(repos: repos)
        state.selectedRepoKeys = ["mean-weasel/issuectl"]
        state.syncRepoSelection(repos: repos + [repo(id: 3, owner: "mean-weasel", name: "third")])

        XCTAssertEqual(state.selectedRepoKeys, ["mean-weasel/issuectl"])
    }

    func testFilterChangesPersistAndResetPaging() {
        let preferences = MacSidebarDisplayPreferences(displayKey: "display-a", defaults: defaults)
        let state = MacIssueFilterState(preferences: preferences)
        state.visiblePageCount = 3

        state.selectedFilter = .running

        XCTAssertEqual(state.visiblePageCount, 1)
        XCTAssertEqual(preferences.issueFilterRawValue, "running")
    }

    func testSearchMineAndSortPersistAndResetPaging() {
        let preferences = MacSidebarDisplayPreferences(displayKey: "display-a", defaults: defaults)
        let state = MacIssueFilterState(preferences: preferences)
        state.visiblePageCount = 3

        state.searchText = "crash"
        state.mineOnly = true
        state.sortOrder = .priority

        XCTAssertEqual(state.visiblePageCount, 1)
        XCTAssertEqual(preferences.issueSearchText, "crash")
        XCTAssertTrue(preferences.issueMineOnly)
        XCTAssertEqual(preferences.issueSortRawValue, "priority")
    }

    func testResetFiltersRestoresDefaultsAndAllRepos() {
        let preferences = MacSidebarDisplayPreferences(displayKey: "display-a", defaults: defaults)
        let state = MacIssueFilterState(preferences: preferences)
        state.syncRepoSelection(repos: repos)
        state.selectedFilter = .closed
        state.sortOrder = .priority
        state.mineOnly = true
        state.searchText = "query"
        state.selectedRepoKeys = ["mean-weasel/issuectl"]
        state.visiblePageCount = 4

        state.resetFilters(repos: repos)

        XCTAssertEqual(state.selectedFilter, .open)
        XCTAssertEqual(state.sortOrder, .updated)
        XCTAssertFalse(state.mineOnly)
        XCTAssertEqual(state.searchText, "")
        XCTAssertEqual(state.selectedRepoKeys, ["mean-weasel/issuectl", "mean-weasel/other"])
        XCTAssertEqual(state.visiblePageCount, 1)
    }

    func testPerDesktopIssueStateDoesNotCollide() {
        let displayA = MacSidebarDisplayPreferences(displayKey: "desktop-a", defaults: defaults, namespace: "spaces")
        let displayB = MacSidebarDisplayPreferences(displayKey: "desktop-b", defaults: defaults, namespace: "spaces")
        let stateA = MacIssueFilterState(preferences: displayA)
        let stateB = MacIssueFilterState(preferences: displayB)

        stateA.selectedFilter = .running
        stateA.sortOrder = .priority
        stateA.mineOnly = true
        stateA.searchText = "alpha"
        stateA.selectedRepoKeys = ["mean-weasel/issuectl"]

        stateB.selectedFilter = .closed
        stateB.sortOrder = .created
        stateB.mineOnly = false
        stateB.searchText = "beta"
        stateB.selectedRepoKeys = ["mean-weasel/other"]

        let reloadedA = MacIssueFilterState(preferences: MacSidebarDisplayPreferences(displayKey: "desktop-a", defaults: defaults, namespace: "spaces"))
        let reloadedB = MacIssueFilterState(preferences: MacSidebarDisplayPreferences(displayKey: "desktop-b", defaults: defaults, namespace: "spaces"))

        XCTAssertEqual(reloadedA.selectedFilter, .running)
        XCTAssertEqual(reloadedA.sortOrder, .priority)
        XCTAssertTrue(reloadedA.mineOnly)
        XCTAssertEqual(reloadedA.searchText, "alpha")
        XCTAssertEqual(reloadedA.selectedRepoKeys, ["mean-weasel/issuectl"])

        XCTAssertEqual(reloadedB.selectedFilter, .closed)
        XCTAssertEqual(reloadedB.sortOrder, .created)
        XCTAssertFalse(reloadedB.mineOnly)
        XCTAssertEqual(reloadedB.searchText, "beta")
        XCTAssertEqual(reloadedB.selectedRepoKeys, ["mean-weasel/other"])
    }

    func testProjectionMatchesIOSSectionSemantics() {
        let projection = MacIssueListModel.project(
            issues: issueItems,
            drafts: drafts,
            sessions: [session(owner: "mean-weasel", repo: "issuectl", issueNumber: 2)],
            selectedRepoKeys: ["mean-weasel/issuectl", "mean-weasel/other"],
            section: .open,
            searchText: "",
            mineOnly: false,
            currentUserLogin: "alice",
            priorities: [:],
            sortOrder: .updated
        )

        XCTAssertEqual(projection.counts[.open], 2)
        XCTAssertEqual(projection.counts[.running], 1)
        XCTAssertEqual(projection.counts[.unassigned], 1)
        XCTAssertEqual(projection.counts[.closed], 1)
        XCTAssertEqual(projection.counts[.drafts], 1)
        XCTAssertEqual(projection.issues.map(\.issue.number), [1, 4])
    }

    func testMineSearchAndPrioritySortAreDeterministic() {
        let projection = MacIssueListModel.project(
            issues: issueItems,
            drafts: drafts,
            sessions: [],
            selectedRepoKeys: ["mean-weasel/issuectl", "mean-weasel/other"],
            section: .open,
            searchText: "mean-weasel",
            mineOnly: true,
            currentUserLogin: "alice",
            priorities: [
                "mean-weasel/issuectl#1": .low,
                "mean-weasel/other#4": .high,
            ],
            sortOrder: .priority
        )

        XCTAssertEqual(projection.issues.map { $0.repoFullName + "#\($0.issue.number)" }, [
            "mean-weasel/other#4",
            "mean-weasel/issuectl#1",
        ])
    }

    func testDraftSearchUsesTitleAndBody() {
        let projection = MacIssueListModel.project(
            issues: issueItems,
            drafts: drafts + [draft(id: "draft-2", title: "Other", body: "contains needle")],
            sessions: [],
            selectedRepoKeys: ["mean-weasel/issuectl", "mean-weasel/other"],
            section: .drafts,
            searchText: "needle",
            mineOnly: false,
            currentUserLogin: nil,
            priorities: [:],
            sortOrder: .updated
        )

        XCTAssertEqual(projection.issues.count, 0)
        XCTAssertEqual(projection.drafts.map(\.id), ["draft-2"])
    }

    func testRepoNameInputParsesOwnerAndName() throws {
        let input = try MacRepoNameInput.parse(" mean-weasel/issuectl ")

        XCTAssertEqual(input.owner, "mean-weasel")
        XCTAssertEqual(input.name, "issuectl")
        XCTAssertEqual(input.fullName, "mean-weasel/issuectl")
    }

    func testRepoNameInputRejectsMalformedNames() {
        XCTAssertThrowsError(try MacRepoNameInput.parse(""))
        XCTAssertThrowsError(try MacRepoNameInput.parse("mean-weasel"))
        XCTAssertThrowsError(try MacRepoNameInput.parse("mean-weasel/"))
        XCTAssertThrowsError(try MacRepoNameInput.parse("/issuectl"))
        XCTAssertThrowsError(try MacRepoNameInput.parse("mean-weasel/issuectl/extra"))
    }

    func testMacOfflineQueueSummaryAndRowsExposeActionDetails() {
        let pendingSummary = MacOfflineQueueSummaryProjection(pendingCount: 2, failedCount: 0)
        XCTAssertEqual(pendingSummary.text, "2 pending, 0 failed")
        XCTAssertEqual(pendingSummary.iconName, "arrow.triangle.2.circlepath")

        let failedSummary = MacOfflineQueueSummaryProjection(pendingCount: 1, failedCount: 1)
        XCTAssertEqual(failedSummary.text, "1 pending, 1 failed")
        XCTAssertEqual(failedSummary.iconName, "exclamationmark.arrow.triangle.2.circlepath")

        let comment = MacOfflineQueueActionProjection(action: queuedComment(status: .pending))
        XCTAssertEqual(comment.title, "Comment on org/alpha#1")
        XCTAssertTrue(comment.detail.contains("pending - queued 2026-05-14T00:00:00Z"))
        XCTAssertNil(comment.lastError)
        XCTAssertEqual(comment.iconName, "clock.arrow.circlepath")

        let failedState = MacOfflineQueueActionProjection(action: queuedState(status: .failed, lastError: "GitHub rejected the state change"))
        XCTAssertEqual(failedState.title, "Close org/alpha#1")
        XCTAssertEqual(failedState.lastError, "GitHub rejected the state change")
        XCTAssertEqual(failedState.iconName, "exclamationmark.triangle")
        XCTAssertTrue(failedState.accessibilityLabel.contains("GitHub rejected the state change"))
    }

    func testMacNotificationUnavailableProjectionDocumentsDeferredPath() {
        let projection = MacNotificationUnavailableProjection()

        XCTAssertEqual(projection.title, "Notifications are iOS-only for now")
        XCTAssertEqual(projection.iconName, "bell.slash")
        XCTAssertTrue(projection.message.contains("issue #444"))
        XCTAssertTrue(projection.accessibilityLabel.contains("backend platform support"))
    }

    func testMacOfflineSyncServiceReplaysAndControlsQueue() async throws {
        let store = OfflineActionQueueStore(defaults: defaults)
        store.enqueueIssueComment(
            owner: "org",
            repo: "alpha",
            issueNumber: 1,
            body: "Queued from Mac",
            id: "comment-1",
            now: Date(timeIntervalSince1970: 0)
        )
        store.enqueueIssueState(
            owner: "org",
            repo: "alpha",
            issueNumber: 1,
            state: "closed",
            comment: "Close from Mac",
            id: "state-1",
            now: Date(timeIntervalSince1970: 1)
        )
        let client = MacOfflineQueueFakeClient(
            commentResponses: [.success(IssueCommentResponse(success: true, commentId: 501, error: nil))],
            stateResponses: [.success(IssueStateResponse(success: true, commentPosted: true, error: nil))]
        )
        let service = OfflineSyncService(store: store, client: client)

        let result = await service.syncPendingActions()

        XCTAssertEqual(result.attempted, 2)
        XCTAssertEqual(result.completed, 2)
        XCTAssertEqual(result.failed, 0)
        XCTAssertTrue(store.allActions().isEmpty)
        XCTAssertEqual(client.requests, [
            .comment(owner: "org", repo: "alpha", number: 1, body: "Queued from Mac"),
            .state(owner: "org", repo: "alpha", number: 1, state: "closed", comment: "Close from Mac"),
        ])
    }

    func testMacOfflineSyncRetryClearAndRemoveControlsMutateQueue() throws {
        let store = OfflineActionQueueStore(defaults: defaults)
        store.enqueueIssueComment(
            owner: "org",
            repo: "alpha",
            issueNumber: 1,
            body: "Queued from Mac",
            id: "comment-1",
            now: Date(timeIntervalSince1970: 0)
        )
        store.markFailed(id: "comment-1", error: "network unavailable", now: Date(timeIntervalSince1970: 1))
        let service = OfflineSyncService(store: store, client: MacOfflineQueueFakeClient())

        service.retryFailedActions()

        XCTAssertEqual(service.pendingCount, 1)
        XCTAssertEqual(service.failedCount, 0)
        XCTAssertEqual(store.allActions().first?.lastError, "network unavailable")

        store.markFailed(id: "comment-1", error: "still offline", now: Date(timeIntervalSince1970: 2))
        service.refreshCounts()
        XCTAssertEqual(service.failedCount, 1)

        service.clearFailedActions()
        XCTAssertTrue(service.actions.isEmpty)

        service.enqueueIssueState(owner: "org", repo: "alpha", issueNumber: 1, state: "open")
        let actionID = try XCTUnwrap(service.actions.first?.id)
        service.removeAction(id: actionID)

        XCTAssertTrue(service.actions.isEmpty)
    }

    func testMacImageAttachmentProcessorPreparesFixtureJPEGData() async throws {
        let data = try await MacImageAttachmentProcessor.preparedJPEGData(from: MacImageAttachmentProcessor.fixturePNGData)

        XCTAssertGreaterThan(data.count, 2)
        XCTAssertEqual(data.prefix(2), Data([0xFF, 0xD8]))
    }

    func testMacImageAttachmentProcessorRejectsInvalidImageData() async {
        do {
            _ = try await MacImageAttachmentProcessor.preparedJPEGData(from: Data("not an image".utf8))
            XCTFail("Expected invalid image data to throw")
        } catch MacImageAttachmentProcessor.ProcessingError.invalidImage {
            // Expected.
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testMacCacheIndicatorFormatsAgeBuckets() {
        let now = Date(timeIntervalSince1970: 3_600)

        XCTAssertEqual(
            MacCacheIndicatorModel.cacheAgeText(cachedAt: Date(timeIntervalSince1970: 3_575), now: now),
            "just now"
        )
        XCTAssertEqual(
            MacCacheIndicatorModel.cacheAgeText(cachedAt: Date(timeIntervalSince1970: 3_000), now: now),
            "10m ago"
        )
        XCTAssertEqual(
            MacCacheIndicatorModel.cacheAgeText(cachedAt: Date(timeIntervalSince1970: 0), now: now),
            "1h ago"
        )
        XCTAssertEqual(
            MacCacheIndicatorModel.cacheAgeText(cachedAt: Date(timeIntervalSince1970: -86_400), now: now),
            "1d ago"
        )
    }

    func testMacCacheIndicatorBuildsBannerAndUpdatedCopy() {
        let now = Date(timeIntervalSince1970: 3_600)
        let cachedAt = "1970-01-01T00:50:00Z"

        XCTAssertEqual(
            MacCacheIndicatorModel.cachedBannerText(kind: "issues", cachedAt: cachedAt, now: now),
            "Showing cached issues from 10m ago"
        )
        XCTAssertEqual(
            MacCacheIndicatorModel.updatedText(cachedAt: cachedAt, now: now),
            "Updated 10m ago"
        )
        XCTAssertNil(MacCacheIndicatorModel.updatedText(cachedAt: nil, now: now))
    }

    func testMacParseReviewStateAutoSelectsConfidentRepoAndAcceptedIssues() {
        let state = MacParseReviewState(parsedIssues: [
            parsedIssue(id: "parsed-1", owner: "mean-weasel", repo: "issuectl", confidence: 0.9),
            parsedIssue(id: "parsed-2", owner: "missing", repo: "repo", confidence: 0.9),
        ], repos: repos)

        XCTAssertEqual(state.acceptedCount, 2)
        XCTAssertTrue(state.isAccepted("parsed-1"))
        XCTAssertEqual(state.selectedRepo(for: "parsed-1"), MacParseRepoSelection(owner: "mean-weasel", name: "issuectl"))
        XCTAssertNil(state.selectedRepo(for: "parsed-2"))
        XCTAssertFalse(state.canCreate)
    }

    func testMacParseReviewStateTogglesAndBuildsReviewedIssues() {
        var state = MacParseReviewState(parsedIssues: [
            parsedIssue(id: "parsed-1", owner: "mean-weasel", repo: "issuectl", confidence: 0.9, labels: ["bug"]),
            parsedIssue(id: "parsed-2", owner: nil, repo: nil, confidence: 0.0, labels: ["docs"]),
        ], repos: repos)

        state.toggleAccepted("parsed-2")

        XCTAssertEqual(state.acceptedCount, 1)
        XCTAssertTrue(state.canCreate)
        let reviewed = state.reviewedIssues()
        XCTAssertEqual(reviewed.count, 1)
        XCTAssertEqual(reviewed.first?.id, "parsed-1")
        XCTAssertEqual(reviewed.first?.owner, "mean-weasel")
        XCTAssertEqual(reviewed.first?.repo, "issuectl")
        XCTAssertEqual(reviewed.first?.labels, ["bug"])
    }

    func testPullRequestProjectionMatchesIOSSectionSemantics() {
        let projection = MacPullRequestListModel.project(
            pulls: pullItems,
            selectedRepoKeys: ["mean-weasel/issuectl", "mean-weasel/other"],
            section: .review,
            searchText: "",
            mineOnly: false,
            currentUserLogin: "alice",
            sortOrder: .updated
        )

        XCTAssertEqual(projection.counts[.review], 2)
        XCTAssertEqual(projection.counts[.open], 3)
        XCTAssertEqual(projection.counts[.merged], 1)
        XCTAssertEqual(projection.counts[.closed], 1)
        XCTAssertEqual(projection.pulls.map(\.pull.number), [10, 11])
    }

    func testPullRequestSearchMineSortAndRepoFilterAreDeterministic() {
        let projection = MacPullRequestListModel.project(
            pulls: pullItems,
            selectedRepoKeys: ["mean-weasel/issuectl"],
            section: .open,
            searchText: "alpha",
            mineOnly: true,
            currentUserLogin: "alice",
            sortOrder: .created
        )

        XCTAssertEqual(projection.counts[.review], 1)
        XCTAssertEqual(projection.counts[.open], 2)
        XCTAssertEqual(projection.pulls.map { $0.repoFullName + "#\($0.pull.number)" }, [
            "mean-weasel/issuectl#12",
            "mean-weasel/issuectl#10",
        ])
    }

    func testMacTodayProjectionBuildsMetricsAttentionAndSearch() {
        let blockingIssue = item(
            number: 9,
            repo: repos[0],
            title: "Blocked login",
            state: "open",
            assignees: [user("alice")],
            author: user("bob"),
            updatedAt: "2026-05-14T10:00:00.000Z",
            labels: [GitHubLabel(name: "blocked", color: "ff9900", description: nil)]
        )
        let otherIssue = item(
            number: 10,
            repo: repos[1],
            title: "Other assigned",
            state: "open",
            assignees: [user("carol")],
            author: user("bob"),
            updatedAt: "2026-05-14T10:00:00.000Z"
        )
        let pulls = [
            pullItem(number: 4, repo: repos[0], title: "Failing review", state: "open", merged: false, author: "alice", checksStatus: "failure", createdAt: "2026-05-14T09:00:00.000Z", updatedAt: "2026-05-14T09:00:00.000Z"),
            pullItem(number: 5, repo: repos[0], title: "Passing cleanup", state: "open", merged: false, author: "alice", checksStatus: "success", createdAt: "2026-05-14T09:00:00.000Z", updatedAt: "2026-05-14T09:00:00.000Z"),
        ]

        let projection = MacTodayModel.project(
            issues: [blockingIssue, otherIssue],
            pulls: pulls,
            sessions: [session(owner: "mean-weasel", repo: "issuectl", issueNumber: 2)],
            searchText: "",
            currentUserLogin: "alice"
        )

        XCTAssertEqual(projection.activeSessionCount, 1)
        XCTAssertEqual(projection.reviewPullCount, 1)
        XCTAssertEqual(projection.issueCount, 1)
        XCTAssertEqual(projection.items.map(\.kind), [.pull, .issue, .session])
        XCTAssertTrue(projection.items[1].isAttention)

        let searchProjection = MacTodayModel.project(
            issues: [blockingIssue, otherIssue],
            pulls: pulls,
            sessions: [session(owner: "mean-weasel", repo: "issuectl", issueNumber: 2)],
            searchText: "failing",
            currentUserLogin: "alice"
        )

        XCTAssertEqual(searchProjection.items.map(\.title), ["Failing review"])
    }

    func testMacLaunchOptionsDefaultsUseSettingsLocalPathAndGeneratedBranch() {
        let repo = Repo(
            id: 1,
            owner: "mean-weasel",
            name: "issuectl",
            localPath: "/tmp/issuectl",
            branchPattern: nil,
            createdAt: "2026-01-01T00:00:00Z"
        )
        let item = item(
            number: 42,
            repo: repo,
            title: "Fix launch options",
            state: "open",
            assignees: [],
            author: user("alice"),
            updatedAt: "2026-05-14T10:00:00.000Z"
        )

        let options = MacIssueLaunchOptions.defaults(for: item, detail: nil, settings: ["launch_agent": "codex"])

        XCTAssertEqual(options.agent, .codex)
        XCTAssertEqual(options.workspaceMode, .worktree)
        XCTAssertEqual(options.branchName, generateBranchName(issueNumber: 42, issueTitle: "Fix launch options"))
        XCTAssertTrue(options.selectedCommentIndices.isEmpty)
        XCTAssertTrue(options.selectedFilePaths.isEmpty)
        XCTAssertEqual(options.resumeBehavior, .automatic)
    }

    func testMacLaunchOptionsBuildRequestBodyWithExplicitChoices() {
        let options = MacIssueLaunchOptions(
            agent: .claude,
            branchName: "custom-mac-launch",
            workspaceMode: .clone,
            selectedCommentIndices: [2, 0],
            selectedFilePaths: ["Sources/Beta.swift", "Sources/Alpha.swift"],
            preamble: "Custom Mac preamble",
            resumeBehavior: .resume
        )

        let body = options.requestBody(idempotencyKey: "launch-id")

        XCTAssertEqual(body.agent, .claude)
        XCTAssertEqual(body.branchName, "custom-mac-launch")
        XCTAssertEqual(body.workspaceMode, .clone)
        XCTAssertEqual(body.selectedCommentIndices, [0, 2])
        XCTAssertEqual(body.selectedFilePaths, ["Sources/Alpha.swift", "Sources/Beta.swift"])
        XCTAssertEqual(body.preamble, "Custom Mac preamble")
        XCTAssertEqual(body.forceResume, true)
        XCTAssertEqual(body.idempotencyKey, "launch-id")
    }

    func testMacSessionProjectionFiltersByRepoSearchAndPreviewText() {
        let sessions = [
            session(owner: "org", repo: "alpha", issueNumber: 2, branchName: "alpha-ready", workspacePath: "/tmp/alpha", ttydPort: 7700),
            session(owner: "org", repo: "beta", issueNumber: 21, branchName: "beta-idle", workspacePath: "/tmp/beta", ttydPort: 7701),
        ]
        let previews = [
            7700: SessionPreview(lines: ["agent booted", "alpha worker ready"], lastUpdatedMs: 1_775_000_000_000, lastChangedMs: 1_775_000_000_000, status: .active),
            7701: SessionPreview(lines: ["beta idle waiting"], lastUpdatedMs: 1_775_000_000_000, lastChangedMs: 1_775_000_000_000, status: .idle),
        ]

        let betaOnly = MacSessionListProjection.project(
            sessions: sessions,
            previewsByPort: previews,
            selectedRepoKeys: ["org/beta"],
            searchText: "idle"
        )

        XCTAssertEqual(betaOnly.sessions.map(\.id), [21])
        XCTAssertEqual(betaOnly.totalCount, 2)
        XCTAssertEqual(betaOnly.repoFilteredCount, 1)

        let previewSearch = MacSessionListProjection.project(
            sessions: sessions,
            previewsByPort: previews,
            selectedRepoKeys: ["org/alpha", "org/beta"],
            searchText: "worker ready"
        )

        XCTAssertEqual(previewSearch.sessions.map(\.id), [2])
    }

    private var repos: [Repo] {
        [
            repo(id: 1, owner: "mean-weasel", name: "issuectl"),
            repo(id: 2, owner: "mean-weasel", name: "other"),
        ]
    }

    private var issueItems: [MacIssueListItem] {
        [
            item(number: 1, repo: repos[0], title: "Open mine", state: "open", assignees: [user("bob")], author: user("alice"), updatedAt: "2026-05-14T10:00:00.000Z"),
            item(number: 2, repo: repos[0], title: "Running issue", state: "open", assignees: [], author: user("bob"), updatedAt: "2026-05-14T11:00:00.000Z"),
            item(number: 3, repo: repos[0], title: "Closed issue", state: "closed", assignees: [], author: user("alice"), updatedAt: "2026-05-14T12:00:00.000Z"),
            item(number: 4, repo: repos[1], title: "Other mine", state: "open", assignees: [user("alice")], author: user("alice"), updatedAt: "2026-05-14T09:00:00.000Z"),
        ]
    }

    private var drafts: [Draft] {
        [draft(id: "draft-1", title: "Draft alpha", body: "body")]
    }

    private var pullItems: [MacPullRequestListItem] {
        [
            pullItem(number: 10, repo: repos[0], title: "Fix alpha workflow", state: "open", merged: false, author: "alice", checksStatus: "failure", createdAt: "2026-05-12T10:00:00.000Z", updatedAt: "2026-05-14T18:00:00.000Z"),
            pullItem(number: 11, repo: repos[0], title: "Pending alpha migration", state: "open", merged: false, author: "bob", checksStatus: "pending", createdAt: "2026-05-12T11:00:00.000Z", updatedAt: "2026-05-14T17:00:00.000Z"),
            pullItem(number: 12, repo: repos[0], title: "Alpha cleanup", state: "open", merged: false, author: "alice", checksStatus: "success", createdAt: "2026-05-12T12:00:00.000Z", updatedAt: "2026-05-14T16:00:00.000Z"),
            pullItem(number: 13, repo: repos[0], title: "Merged docs", state: "closed", merged: true, author: "carol", checksStatus: "success", createdAt: "2026-05-12T13:00:00.000Z", updatedAt: "2026-05-14T15:00:00.000Z", mergedAt: "2026-05-14T15:30:00.000Z", closedAt: "2026-05-14T15:30:00.000Z"),
            pullItem(number: 21, repo: repos[1], title: "Other pending review", state: "closed", merged: false, author: "alice", checksStatus: "failure", createdAt: "2026-05-12T14:00:00.000Z", updatedAt: "2026-05-14T14:00:00.000Z", closedAt: "2026-05-14T14:30:00.000Z"),
        ]
    }

    private func repo(id: Int, owner: String, name: String) -> Repo {
        Repo(id: id, owner: owner, name: name, localPath: nil, branchPattern: nil, createdAt: "2026-01-01T00:00:00Z")
    }

    private func item(
        number: Int,
        repo: Repo,
        title: String,
        state: String,
        assignees: [GitHubUser],
        author: GitHubUser,
        updatedAt: String,
        labels: [GitHubLabel] = []
    ) -> MacIssueListItem {
        let issue = GitHubIssue(
            number: number,
            title: title,
            body: "Issue body",
            state: state,
            labels: labels,
            assignees: assignees,
            user: author,
            commentCount: 0,
            createdAt: "2026-05-13T10:00:00.000Z",
            updatedAt: updatedAt,
            closedAt: state == "closed" ? "2026-05-14T13:00:00.000Z" : nil,
            htmlUrl: "https://github.com/\(repo.owner)/\(repo.name)/issues/\(number)"
        )
        return MacIssueListItem(issue: issue, repo: repo, repoIndex: repo.id - 1)
    }

    private func user(_ login: String) -> GitHubUser {
        GitHubUser(login: login, avatarUrl: "https://example.com/\(login).png")
    }

    private func pullItem(
        number: Int,
        repo: Repo,
        title: String,
        state: String,
        merged: Bool,
        author: String,
        checksStatus: String?,
        createdAt: String,
        updatedAt: String,
        mergedAt: String? = nil,
        closedAt: String? = nil
    ) -> MacPullRequestListItem {
        MacPullRequestListItem(
            pull: GitHubPull(
                number: number,
                title: title,
                body: "Pull body",
                state: state,
                draft: false,
                merged: merged,
                user: user(author),
                headRef: "head-\(number)",
                baseRef: "main",
                additions: 10,
                deletions: 2,
                changedFiles: 3,
                createdAt: createdAt,
                updatedAt: updatedAt,
                mergedAt: mergedAt,
                closedAt: closedAt,
                htmlUrl: "https://github.com/\(repo.owner)/\(repo.name)/pull/\(number)",
                checksStatus: checksStatus
            ),
            repo: repo,
            repoIndex: repo.id - 1
        )
    }

    private func draft(id: String, title: String, body: String?) -> Draft {
        Draft(id: id, title: title, body: body, priority: .normal, createdAt: 1_775_000_000)
    }

    private func parsedIssue(
        id: String,
        owner: String?,
        repo: String?,
        confidence: Double,
        labels: [String] = []
    ) -> ParsedIssue {
        ParsedIssue(
            id: id,
            originalText: "Original \(id)",
            title: "Parsed \(id)",
            body: "Parsed body",
            type: "bug",
            repoOwner: owner,
            repoName: repo,
            repoConfidence: confidence,
            suggestedLabels: labels,
            clarity: owner == nil ? "unknown_repo" : "clear"
        )
    }

    private func session(
        owner: String,
        repo: String,
        issueNumber: Int,
        branchName: String? = nil,
        workspacePath: String? = nil,
        ttydPort: Int? = nil
    ) -> ActiveDeployment {
        ActiveDeployment(
            id: issueNumber,
            repoId: 1,
            issueNumber: issueNumber,
            branchName: branchName ?? "issue-\(issueNumber)",
            workspaceMode: .worktree,
            workspacePath: workspacePath ?? "/tmp/issue-\(issueNumber)",
            linkedPrNumber: nil,
            state: .active,
            launchedAt: "2026-05-14T10:00:00.000Z",
            endedAt: nil,
            ttydPort: ttydPort,
            ttydPid: nil,
            owner: owner,
            repoName: repo
        )
    }

    private func queuedComment(status: OfflineActionStatus, lastError: String? = nil) -> QueuedOfflineAction {
        QueuedOfflineAction(
            id: "comment-1",
            kind: .issueComment(IssueCommentOfflineAction(
                owner: "org",
                repo: "alpha",
                issueNumber: 1,
                body: "Queued from Mac"
            )),
            status: status,
            retryCount: status == .failed ? 1 : 0,
            lastError: lastError,
            createdAt: "2026-05-14T00:00:00Z",
            updatedAt: "2026-05-14T00:00:00Z"
        )
    }

    private func queuedState(status: OfflineActionStatus, lastError: String? = nil) -> QueuedOfflineAction {
        QueuedOfflineAction(
            id: "state-1",
            kind: .issueState(IssueStateOfflineAction(
                owner: "org",
                repo: "alpha",
                issueNumber: 1,
                state: "closed",
                comment: "Close from Mac"
            )),
            status: status,
            retryCount: status == .failed ? 1 : 0,
            lastError: lastError,
            createdAt: "2026-05-14T00:00:00Z",
            updatedAt: "2026-05-14T00:00:00Z"
        )
    }
}

private enum MacOfflineQueueFakeRequest: Equatable {
    case comment(owner: String, repo: String, number: Int, body: String)
    case state(owner: String, repo: String, number: Int, state: String, comment: String?)
}

@MainActor
private final class MacOfflineQueueFakeClient: OfflineIssueCommentPosting, OfflineIssueStateUpdating {
    private var commentResponses: [Result<IssueCommentResponse, Error>]
    private var stateResponses: [Result<IssueStateResponse, Error>]
    private(set) var requests: [MacOfflineQueueFakeRequest] = []

    init(
        commentResponses: [Result<IssueCommentResponse, Error>] = [],
        stateResponses: [Result<IssueStateResponse, Error>] = []
    ) {
        self.commentResponses = commentResponses
        self.stateResponses = stateResponses
    }

    func commentOnIssue(
        owner: String,
        repo: String,
        number: Int,
        body: IssueCommentRequestBody
    ) async throws -> IssueCommentResponse {
        requests.append(.comment(owner: owner, repo: repo, number: number, body: body.body))
        guard !commentResponses.isEmpty else {
            return IssueCommentResponse(success: true, commentId: nil, error: nil)
        }
        return try commentResponses.removeFirst().get()
    }

    func updateIssueState(
        owner: String,
        repo: String,
        number: Int,
        body: IssueStateRequestBody
    ) async throws -> IssueStateResponse {
        requests.append(.state(owner: owner, repo: repo, number: number, state: body.state, comment: body.comment))
        guard !stateResponses.isEmpty else {
            return IssueStateResponse(success: true, commentPosted: nil, error: nil)
        }
        return try stateResponses.removeFirst().get()
    }
}
