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

        state.selectedFilter = .unassigned

        XCTAssertEqual(state.visiblePageCount, 1)
        XCTAssertEqual(preferences.issueFilterRawValue, "unassigned")
    }

    private var repos: [Repo] {
        [
            repo(id: 1, owner: "mean-weasel", name: "issuectl"),
            repo(id: 2, owner: "mean-weasel", name: "other"),
        ]
    }

    private func repo(id: Int, owner: String, name: String) -> Repo {
        Repo(id: id, owner: owner, name: name, localPath: nil, branchPattern: nil, createdAt: "2026-01-01T00:00:00Z")
    }
}
