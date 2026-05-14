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
        updatedAt: String
    ) -> MacIssueListItem {
        let issue = GitHubIssue(
            number: number,
            title: title,
            body: "Issue body",
            state: state,
            labels: [],
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

    private func session(owner: String, repo: String, issueNumber: Int) -> ActiveDeployment {
        ActiveDeployment(
            id: issueNumber,
            repoId: 1,
            issueNumber: issueNumber,
            branchName: "issue-\(issueNumber)",
            workspaceMode: .worktree,
            workspacePath: "/tmp/issue-\(issueNumber)",
            linkedPrNumber: nil,
            state: .active,
            launchedAt: "2026-05-14T10:00:00.000Z",
            endedAt: nil,
            ttydPort: nil,
            ttydPid: nil,
            owner: owner,
            repoName: repo
        )
    }
}
