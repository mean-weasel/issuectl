import XCTest

@MainActor
final class MacSidebarSmokeTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false

        app = XCUIApplication()
        app.launchEnvironment["ISSUECTL_UI_TESTING"] = "1"
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_API"] = "1"
        app.launchEnvironment["ISSUECTL_SERVER_URL"] = "http://issuectl-ui-test.local"
        app.launchEnvironment["ISSUECTL_API_TOKEN"] = "mac-ui-smoke-token"
        app.launch()
    }

    override func tearDownWithError() throws {
        app.terminate()
        app = nil
    }

    func testSidebarLaunchesCollapsesExpandsAndHides() {
        let title = app.staticTexts["IssueCTL"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 8), app.debugDescription)

        app.buttons["mac-sidebar-collapse-button"].click()
        XCTAssertTrue(app.buttons["mac-sidebar-expand-button"].waitForExistence(timeout: 3), app.debugDescription)

        app.buttons["mac-sidebar-expand-button"].click()
        XCTAssertTrue(app.buttons["mac-sidebar-collapse-button"].waitForExistence(timeout: 3), app.debugDescription)

        app.buttons["mac-sidebar-hide-button"].click()
        XCTAssertTrue(title.waitForNonExistence(timeout: 3), app.debugDescription)
    }

    func testIssueListFiltersSortsResetsAndLoadsMore() {
        XCTAssertTrue(issueRow("org/alpha", 1).waitForExistence(timeout: 8), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-issues-section-counts"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-issues-filter-summary"].waitForExistence(timeout: 5), app.debugDescription)

        let loadMore = app.buttons["mac-issues-load-more-button"]
        XCTAssertTrue(loadMore.waitForExistence(timeout: 5), app.debugDescription)
        loadMore.click()
        let paginationSummary = app.staticTexts["mac-issues-pagination-summary"]
        XCTAssertTrue(paginationSummary.waitForExistence(timeout: 5), app.debugDescription)
        let paginationSummaryText = (paginationSummary.value as? String) ?? paginationSummary.label
        XCTAssertTrue(
            paginationSummaryText.contains("Showing 53 of 53"),
            "\(paginationSummaryText)\n\(app.debugDescription)"
        )
        XCTAssertFalse(loadMore.exists, app.debugDescription)

        issueState("Running").click()
        XCTAssertTrue(issueRow("org/alpha", 2).waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(issueRow("org/alpha", 1).exists, app.debugDescription)

        issueState("Closed").click()
        XCTAssertTrue(issueRow("org/alpha", 4).waitForExistence(timeout: 5), app.debugDescription)

        issueState("Drafts").click()
        XCTAssertTrue(draftRow("draft-1").waitForExistence(timeout: 5), app.debugDescription)

        issueState("Open").click()
        issueSort("Priority").click()
        XCTAssertTrue(issueRow("org/alpha", 3).waitForExistence(timeout: 5), app.debugDescription)

        let mine = app.checkBoxes["mac-issues-mine-filter"]
        XCTAssertTrue(mine.waitForExistence(timeout: 5), app.debugDescription)
        mine.click()

        let search = app.textFields["mac-issues-search-field"]
        XCTAssertTrue(search.waitForExistence(timeout: 5), app.debugDescription)
        search.click()
        search.typeText("unassigned")
        XCTAssertTrue(issueRow("org/alpha", 3).waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(issueRow("org/alpha", 6).exists, app.debugDescription)

        app.buttons["mac-issues-reset-filters-button"].click()
        XCTAssertTrue(issueRow("org/alpha", 1).waitForExistence(timeout: 5), app.debugDescription)
    }

    func testPullRequestListFiltersPaginatesAndOpensDetail() {
        selectRootSection("PRs")

        XCTAssertTrue(prRow("org/alpha", 10).waitForExistence(timeout: 8), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-prs-section-counts"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-prs-filter-summary"].waitForExistence(timeout: 5), app.debugDescription)

        app.buttons["mac-sidebar-collapse-button"].click()
        XCTAssertTrue(app.buttons["mac-sidebar-section-pullRequests"].waitForExistence(timeout: 5), app.debugDescription)
        app.buttons["mac-sidebar-expand-button"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-prs-search-field"].waitForExistence(timeout: 5), app.debugDescription)

        prSection("Open").click()
        XCTAssertTrue(prRow("org/alpha", 12).waitForExistence(timeout: 5), app.debugDescription)
        let loadMore = app.buttons["mac-prs-load-more-button"]
        XCTAssertTrue(loadMore.waitForExistence(timeout: 5), app.debugDescription)
        loadMore.click()
        XCTAssertTrue(prRow("org/beta", 21).waitForExistence(timeout: 5), app.debugDescription)

        let search = app.textFields["mac-prs-search-field"]
        XCTAssertTrue(search.waitForExistence(timeout: 5), app.debugDescription)
        search.click()
        search.typeText("design")
        XCTAssertTrue(prRow("org/alpha", 15).waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(prRow("org/alpha", 10).exists, app.debugDescription)

        app.buttons["mac-prs-reset-filters-button"].click()
        prSection("Open").click()
        prSort("Created").click()
        XCTAssertTrue(prRow("org/alpha", 12).waitForExistence(timeout: 5), app.debugDescription)

        let alphaRepo = app.checkBoxes["org/alpha"]
        XCTAssertTrue(alphaRepo.waitForExistence(timeout: 5), app.debugDescription)
        alphaRepo.click()
        XCTAssertTrue(prRow("org/beta", 21).waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(prRow("org/alpha", 10).exists, app.debugDescription)

        app.buttons["mac-prs-reset-filters-button"].click()
        prSection("Open").click()

        let mine = app.checkBoxes["mac-prs-mine-filter"]
        XCTAssertTrue(mine.waitForExistence(timeout: 5), app.debugDescription)
        mine.click()
        XCTAssertTrue(prRow("org/alpha", 10).waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(prRow("org/alpha", 11).exists, app.debugDescription)

        app.buttons["mac-prs-reset-filters-button"].click()
        openPullRequest(prRow("org/alpha", 10))
        XCTAssertTrue(app.descendants(matching: .any)["mac-pr-detail-title"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-pr-detail-body"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-pr-detail-check-build"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-pr-detail-file-Sources/Alpha.swift"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-pr-detail-review-301"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-pr-detail-linked-issue-1"].waitForExistence(timeout: 5), app.debugDescription)
        app.typeKey(.escape, modifierFlags: [])
    }

    func testPullRequestDetailActionsSucceedAndRefresh() {
        selectRootSection("PRs")
        openPullRequest(prRow("org/alpha", 10))

        XCTAssertTrue(app.buttons["mac-pr-detail-comment-button"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.buttons["mac-pr-detail-approve-button"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.buttons["mac-pr-detail-request-changes-button"].waitForExistence(timeout: 5), app.debugDescription)
        let mergeMenu = app.descendants(matching: .any)["mac-pr-detail-merge-menu"]
        XCTAssertTrue(mergeMenu.waitForExistence(timeout: 5), app.debugDescription)

        app.buttons["mac-pr-detail-comment-button"].click()
        let commentBody = app.textViews["mac-pr-comment-body-field"]
        XCTAssertTrue(commentBody.waitForExistence(timeout: 5), app.debugDescription)
        commentBody.click()
        commentBody.typeText("Mac PR comment")
        app.buttons["mac-pr-comment-submit-button"].click()
        XCTAssertTrue(commentBody.waitForNonExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.staticTexts["mac-pr-detail-success-message"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-pr-detail-body"].waitForExistence(timeout: 5), app.debugDescription)

        app.buttons["mac-pr-detail-approve-button"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-pr-detail-review-401"].waitForExistence(timeout: 5), app.debugDescription)

        app.buttons["mac-pr-detail-request-changes-button"].click()
        let requestChangesBody = app.textViews["mac-pr-request-changes-body-field"]
        XCTAssertTrue(requestChangesBody.waitForExistence(timeout: 5), app.debugDescription)
        requestChangesBody.click()
        requestChangesBody.typeText("Please adjust the Mac implementation")
        app.buttons["mac-pr-request-changes-submit-button"].click()
        XCTAssertTrue(requestChangesBody.waitForNonExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-pr-detail-review-402"].waitForExistence(timeout: 5), app.debugDescription)

        mergeMenu.click()
        app.menuItems["Squash and Merge"].firstMatch.click()
        XCTAssertTrue(app.staticTexts["mac-pr-detail-success-message"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.buttons["mac-pr-detail-comment-button"].waitForNonExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(app.buttons["mac-pr-detail-approve-button"].exists, app.debugDescription)
        XCTAssertFalse(app.buttons["mac-pr-detail-request-changes-button"].exists, app.debugDescription)
        XCTAssertFalse(app.descendants(matching: .any)["mac-pr-detail-merge-menu"].exists, app.debugDescription)
    }

    func testPullRequestActionFailurePreservesTypedText() {
        app.terminate()
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_PULL_ACTION_FAILURE"] = "1"
        app.launch()

        selectRootSection("PRs")
        openPullRequest(prRow("org/alpha", 10))

        app.buttons["mac-pr-detail-request-changes-button"].click()
        let requestChangesBody = app.textViews["mac-pr-request-changes-body-field"]
        XCTAssertTrue(requestChangesBody.waitForExistence(timeout: 5), app.debugDescription)
        requestChangesBody.click()
        requestChangesBody.typeText("Keep this review text")
        app.buttons["mac-pr-request-changes-submit-button"].click()

        XCTAssertTrue(app.staticTexts["mac-pr-request-changes-error"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(waitForValue(of: requestChangesBody, containing: "Keep this review text", timeout: 3), app.debugDescription)
        XCTAssertTrue(app.buttons["mac-pr-request-changes-submit-button"].exists, app.debugDescription)
    }

    func testLinkedIssueAndPullRequestDetailNavigation() {
        let firstIssue = issueRow("org/alpha", 1)
        XCTAssertTrue(firstIssue.waitForExistence(timeout: 8), app.debugDescription)
        openIssue(firstIssue)

        let linkedPullRequest = app.descendants(matching: .any)["mac-issue-detail-linked-pr-7"]
        XCTAssertTrue(linkedPullRequest.waitForExistence(timeout: 5), app.debugDescription)
        linkedPullRequest.click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-pr-detail-title"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.staticTexts["Fix alpha detail"].waitForExistence(timeout: 5), app.debugDescription)
        app.typeKey(.escape, modifierFlags: [])
        XCTAssertTrue(app.descendants(matching: .any)["mac-pr-detail-title"].waitForNonExistence(timeout: 5), app.debugDescription)

        app.typeKey(.escape, modifierFlags: [])
        XCTAssertTrue(app.buttons["mac-issue-detail-edit-button"].waitForNonExistence(timeout: 5), app.debugDescription)
        selectRootSection("PRs")
        openPullRequest(prRow("org/alpha", 10))

        let linkedIssue = app.descendants(matching: .any)["mac-pr-detail-linked-issue-1"]
        XCTAssertTrue(linkedIssue.waitForExistence(timeout: 5), app.debugDescription)
        linkedIssue.click()
        XCTAssertTrue(app.buttons["mac-issue-detail-edit-button"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.staticTexts["Open alpha issue"].waitForExistence(timeout: 5), app.debugDescription)
    }

    func testDefaultIssueLaunchUsesExistingOneClickFlow() {
        let firstIssue = issueRow("org/alpha", 1)
        XCTAssertTrue(firstIssue.waitForExistence(timeout: 8), app.debugDescription)
        openIssue(firstIssue)

        let launchButton = app.buttons["mac-issue-detail-launch-button"]
        XCTAssertTrue(launchButton.waitForExistence(timeout: 5), app.debugDescription)
        launchButton.click()

        XCTAssertTrue(app.staticTexts["Session Starting"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.staticTexts["issue-1-open-alpha-issue - terminal preparing"].waitForExistence(timeout: 5), app.debugDescription)
    }

    func testCustomIssueLaunchOptionsBuildLaunchRequest() {
        app.terminate()
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_ASSERT_CUSTOM_LAUNCH"] = "1"
        app.launch()

        let firstIssue = issueRow("org/alpha", 1)
        XCTAssertTrue(firstIssue.waitForExistence(timeout: 8), app.debugDescription)
        openIssue(firstIssue)

        app.buttons["mac-issue-detail-launch-options-button"].click()
        let branchField = app.textFields["mac-launch-options-branch-field"]
        XCTAssertTrue(branchField.waitForExistence(timeout: 5), app.debugDescription)

        app.descendants(matching: .any)["mac-launch-options-agent-picker"].radioButtons["Claude Code"].click()
        app.descendants(matching: .any)["mac-launch-options-workspace-picker"].radioButtons["Clone"].click()
        app.descendants(matching: .any)["mac-launch-options-resume-picker"].radioButtons["Resume"].click()

        branchField.click()
        branchField.typeKey("a", modifierFlags: .command)
        branchField.typeText("custom-mac-launch")

        let preamble = app.textViews["mac-launch-options-preamble-field"]
        XCTAssertTrue(preamble.waitForExistence(timeout: 5), app.debugDescription)
        preamble.click()
        preamble.typeText("Custom Mac preamble")

        app.checkBoxes["mac-launch-options-comment-0"].click()
        app.checkBoxes["mac-launch-options-file-Sources/Alpha.swift"].click()

        app.buttons["mac-launch-options-submit-button"].click()
        XCTAssertTrue(app.staticTexts["custom-mac-launch - terminal preparing"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(app.descendants(matching: .any)["mac-issue-detail-error-message"].exists, app.debugDescription)
    }

    func testLaunchOptionsDirtyWorktreeCanResumeWithChanges() {
        app.terminate()
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_DIRTY_WORKTREE"] = "1"
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_ASSERT_DIRTY_RESUME_LAUNCH"] = "1"
        app.launch()

        let firstIssue = issueRow("org/alpha", 1)
        XCTAssertTrue(firstIssue.waitForExistence(timeout: 8), app.debugDescription)
        openIssue(firstIssue)

        app.buttons["mac-issue-detail-launch-options-button"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-launch-options-dirty-worktree-warning"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(app.buttons["mac-launch-options-submit-button"].isEnabled, app.debugDescription)

        app.buttons["mac-launch-options-resume-dirty-button"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-launch-options-reset-message"].waitForExistence(timeout: 5), app.debugDescription)
        app.buttons["mac-launch-options-submit-button"].click()

        XCTAssertTrue(app.staticTexts["issue-1-open-alpha-issue - terminal preparing"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(app.descendants(matching: .any)["mac-issue-detail-error-message"].exists, app.debugDescription)
    }

    func testLaunchOptionsDirtyWorktreeCanResetBeforeLaunch() {
        app.terminate()
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_DIRTY_WORKTREE"] = "1"
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_ASSERT_RESET_THEN_LAUNCH"] = "1"
        app.launch()

        let firstIssue = issueRow("org/alpha", 1)
        XCTAssertTrue(firstIssue.waitForExistence(timeout: 8), app.debugDescription)
        openIssue(firstIssue)

        app.buttons["mac-issue-detail-launch-options-button"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-launch-options-dirty-worktree-warning"].waitForExistence(timeout: 5), app.debugDescription)
        app.buttons["mac-launch-options-reset-worktree-button"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-launch-options-reset-message"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-launch-options-readiness-summary"].waitForExistence(timeout: 5), app.debugDescription)

        app.buttons["mac-launch-options-submit-button"].click()
        XCTAssertTrue(app.staticTexts["issue-1-open-alpha-issue - terminal preparing"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(app.descendants(matching: .any)["mac-issue-detail-error-message"].exists, app.debugDescription)
    }

    func testLaunchOptionsWorktreeStatusFailureCanFallbackToClone() {
        app.terminate()
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_WORKTREE_STATUS_FAILURE"] = "1"
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_ASSERT_CLONE_LAUNCH"] = "1"
        app.launch()

        let firstIssue = issueRow("org/alpha", 1)
        XCTAssertTrue(firstIssue.waitForExistence(timeout: 8), app.debugDescription)
        openIssue(firstIssue)

        app.buttons["mac-issue-detail-launch-options-button"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-launch-options-worktree-status-error"].waitForExistence(timeout: 5), app.debugDescription)
        app.descendants(matching: .any)["mac-launch-options-workspace-picker"].radioButtons["Clone"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-launch-options-readiness-summary"].waitForExistence(timeout: 5), app.debugDescription)
        app.buttons["mac-launch-options-submit-button"].click()

        XCTAssertTrue(app.staticTexts["issue-1-open-alpha-issue - terminal preparing"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(app.descendants(matching: .any)["mac-issue-detail-error-message"].exists, app.debugDescription)
    }

    func testLaunchOptionsNoLocalPathFallsBackToClone() {
        app.terminate()
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_NO_LOCAL_PATH"] = "1"
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_ASSERT_CLONE_LAUNCH"] = "1"
        app.launch()

        let firstIssue = issueRow("org/alpha", 1)
        XCTAssertTrue(firstIssue.waitForExistence(timeout: 8), app.debugDescription)
        openIssue(firstIssue)

        app.buttons["mac-issue-detail-launch-options-button"].click()
        let workspacePicker = app.descendants(matching: .any)["mac-launch-options-workspace-picker"]
        XCTAssertTrue(workspacePicker.waitForExistence(timeout: 5), app.debugDescription)
        workspacePicker.radioButtons["Worktree"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-launch-options-fallback-explanation"].waitForExistence(timeout: 5), app.debugDescription)
        app.buttons["mac-launch-options-submit-button"].click()

        XCTAssertTrue(app.staticTexts["issue-1-open-alpha-issue - terminal preparing"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(app.descendants(matching: .any)["mac-issue-detail-error-message"].exists, app.debugDescription)
    }

    func testLaunchOptionsFailuresRemainRecoverable() {
        app.terminate()
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_LAUNCH_FAILURE"] = "1"
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_WORKTREE_RESET_FAILURE"] = "1"
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_DIRTY_WORKTREE"] = "1"
        app.launch()

        let firstIssue = issueRow("org/alpha", 1)
        XCTAssertTrue(firstIssue.waitForExistence(timeout: 8), app.debugDescription)
        openIssue(firstIssue)

        app.buttons["mac-issue-detail-launch-options-button"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-launch-options-dirty-worktree-warning"].waitForExistence(timeout: 5), app.debugDescription)
        app.buttons["mac-launch-options-reset-worktree-button"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-launch-options-reset-error"].waitForExistence(timeout: 5), app.debugDescription)

        app.buttons["mac-launch-options-resume-dirty-button"].click()
        app.buttons["mac-launch-options-submit-button"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-launch-options-submit-error"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.buttons["mac-launch-options-submit-button"].exists, app.debugDescription)
    }

    func testActiveSessionsFiltersPreviewNavigationOpenAndEnd() {
        selectRootSection("Active")

        XCTAssertTrue(app.descendants(matching: .any)["mac-session-row-2"].waitForExistence(timeout: 8), app.debugDescription)
        XCTAssertTrue(app.staticTexts["alpha worker ready"].waitForExistence(timeout: 5), app.debugDescription)

        let search = app.textFields["mac-sessions-search-field"]
        XCTAssertTrue(search.waitForExistence(timeout: 5), app.debugDescription)
        search.click()
        search.typeText("beta idle")
        XCTAssertTrue(app.descendants(matching: .any)["mac-session-row-8"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(app.descendants(matching: .any)["mac-session-row-2"].exists, app.debugDescription)

        search.typeKey("a", modifierFlags: .command)
        search.typeKey(.delete, modifierFlags: [])
        XCTAssertTrue(app.checkBoxes["org/alpha"].waitForExistence(timeout: 5), app.debugDescription)
        app.checkBoxes["org/alpha"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-session-row-8"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(app.descendants(matching: .any)["mac-session-row-2"].exists, app.debugDescription)

        app.buttons["All"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-session-row-2"].waitForExistence(timeout: 5), app.debugDescription)

        app.buttons["View issue for session 2"].click()
        XCTAssertTrue(app.staticTexts["Running alpha issue"].waitForExistence(timeout: 5), app.debugDescription)
        app.typeKey(.escape, modifierFlags: [])
        XCTAssertTrue(app.staticTexts["Running alpha issue"].waitForNonExistence(timeout: 5), app.debugDescription)

        app.buttons["Open terminal for session 2"].click()
        XCTAssertTrue(app.staticTexts["Terminal opened on port 7700"].waitForExistence(timeout: 5), app.debugDescription)

        app.buttons["End session 2"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-session-row-2"].waitForNonExistence(timeout: 5), app.debugDescription)
    }

    func testActiveSessionEndFailureKeepsRowAndShowsError() {
        app.terminate()
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_END_SESSION_FAILURE"] = "1"
        app.launch()

        selectRootSection("Active")
        XCTAssertTrue(app.descendants(matching: .any)["mac-session-row-2"].waitForExistence(timeout: 8), app.debugDescription)

        app.buttons["End session 2"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-sessions-error"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-session-row-2"].exists, app.debugDescription)
    }

    func testPullRequestFailuresAreRecoverableAndPreserveFilters() {
        app.terminate()
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_BETA_PULLS_FAILURE"] = "1"
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_PULL_DETAIL_FAILURE"] = "1"
        app.launch()

        selectRootSection("PRs")

        XCTAssertTrue(prRow("org/alpha", 10).waitForExistence(timeout: 8), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-prs-inline-error"].waitForExistence(timeout: 5), app.debugDescription)

        prSection("Open").click()
        let search = app.textFields["mac-prs-search-field"]
        XCTAssertTrue(search.waitForExistence(timeout: 5), app.debugDescription)
        search.click()
        search.typeText("alpha")
        XCTAssertTrue(waitForValue(of: search, containing: "alpha", timeout: 3), app.debugDescription)
        XCTAssertTrue(prRow("org/alpha", 10).exists, app.debugDescription)

        openPullRequest(prRow("org/alpha", 10))
        XCTAssertTrue(app.descendants(matching: .any)["mac-pr-detail-error"].waitForExistence(timeout: 5), app.debugDescription)
        app.typeKey(.escape, modifierFlags: [])

        XCTAssertTrue(waitForValue(of: search, containing: "alpha", timeout: 3), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-prs-inline-error"].exists, app.debugDescription)
        XCTAssertTrue(prRow("org/alpha", 10).exists, app.debugDescription)
    }

    func testIssueDetailCoreActionsAndContext() {
        let firstIssue = issueRow("org/alpha", 1)
        XCTAssertTrue(firstIssue.waitForExistence(timeout: 8), app.debugDescription)

        let editButton = app.buttons["mac-issue-detail-edit-button"]
        firstIssue.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()
        if !editButton.waitForExistence(timeout: 2) {
            firstIssue.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()
        }

        XCTAssertTrue(editButton.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-issue-detail-body-markdown"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-issue-detail-linked-pr-7"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-issue-detail-deployment-9"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.buttons["mac-issue-detail-edit-comment-101"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(app.buttons["mac-issue-detail-edit-comment-102"].exists, app.debugDescription)

        app.buttons["mac-issue-detail-edit-button"].click()
        let titleField = app.textFields["mac-edit-issue-title-field"]
        XCTAssertTrue(titleField.waitForExistence(timeout: 5), app.debugDescription)
        titleField.click()
        titleField.typeKey("a", modifierFlags: .command)
        titleField.typeText("Updated alpha issue")
        app.buttons["mac-edit-issue-save-button"].click()
        XCTAssertTrue(app.staticTexts["Updated alpha issue"].waitForExistence(timeout: 5), app.debugDescription)

        app.buttons["mac-issue-detail-edit-comment-101"].click()
        let commentBody = app.textViews["mac-edit-comment-body-field"]
        XCTAssertTrue(commentBody.waitForExistence(timeout: 5), app.debugDescription)
        commentBody.click()
        commentBody.typeKey("a", modifierFlags: .command)
        commentBody.typeText("Edited own comment")
        app.buttons["mac-edit-comment-save-button"].click()
        XCTAssertTrue(app.staticTexts["Edited own comment"].waitForExistence(timeout: 5), app.debugDescription)

        app.buttons["mac-issue-detail-close-with-comment-button"].click()
        let closingComment = app.textViews["mac-close-issue-comment-field"]
        XCTAssertTrue(closingComment.waitForExistence(timeout: 5), app.debugDescription)
        closingComment.click()
        closingComment.typeText("Closing with mac detail parity")
        app.buttons["mac-close-issue-submit-button"].click()
        XCTAssertTrue(app.staticTexts["Closed"].waitForExistence(timeout: 5), app.debugDescription)

        app.buttons["mac-issue-detail-delete-comment-101"].click()
        app.buttons["action-button-1"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-issue-detail-comment-101"].waitForNonExistence(timeout: 5), app.debugDescription)
    }

    func testIssueDetailManagementActions() {
        let firstIssue = issueRow("org/alpha", 1)
        XCTAssertTrue(firstIssue.waitForExistence(timeout: 8), app.debugDescription)

        let labelsButton = app.buttons["mac-issue-detail-labels-button"]
        firstIssue.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()
        if !labelsButton.waitForExistence(timeout: 2) {
            firstIssue.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()
        }

        XCTAssertTrue(labelsButton.waitForExistence(timeout: 5), app.debugDescription)
        labelsButton.click()
        let enhancementLabel = app.descendants(matching: .any)["mac-label-management-row-enhancement"]
        XCTAssertTrue(enhancementLabel.waitForExistence(timeout: 5), app.debugDescription)
        enhancementLabel.click()
        app.buttons["Done"].firstMatch.click()
        XCTAssertTrue(app.staticTexts["enhancement"].waitForExistence(timeout: 5), app.debugDescription)

        app.buttons["mac-issue-detail-assignees-button"].click()
        let carolAssignee = app.descendants(matching: .any)["mac-assignee-management-row-carol"]
        XCTAssertTrue(carolAssignee.waitForExistence(timeout: 5), app.debugDescription)
        carolAssignee.click()
        app.buttons["Done"].firstMatch.click()
        XCTAssertTrue(app.staticTexts["Assigned to bob, carol"].waitForExistence(timeout: 5), app.debugDescription)

        app.buttons["mac-issue-detail-reassign-button"].click()
        let betaTarget = app.descendants(matching: .any)["mac-reassign-target-org/beta"]
        XCTAssertTrue(betaTarget.waitForExistence(timeout: 5), app.debugDescription)
        betaTarget.click()
        app.buttons["mac-reassign-submit-button"].click()
        let successMessage = app.descendants(matching: .any)["mac-issue-detail-success-message"]
        XCTAssertTrue(successMessage.waitForExistence(timeout: 5), app.debugDescription)
        let successText = (successMessage.value as? String) ?? successMessage.label
        XCTAssertTrue(successText.contains("org/beta#77"), "\(successText)\n\(app.debugDescription)")
    }

    func testIssueDetailMarkdownImagesOpenLightbox() {
        let firstIssue = issueRow("org/alpha", 1)
        XCTAssertTrue(firstIssue.waitForExistence(timeout: 8), app.debugDescription)

        let imageAttachment = app.descendants(matching: .any)["mac-issue-body-image-1"]
        firstIssue.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()
        if !imageAttachment.waitForExistence(timeout: 2) {
            firstIssue.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()
        }

        XCTAssertTrue(imageAttachment.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertGreaterThan(imageAttachment.frame.height, 100, app.debugDescription)

        imageAttachment.click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-image-lightbox-loaded-image"].waitForExistence(timeout: 5), app.debugDescription)
        app.buttons["mac-image-lightbox-close-button"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-image-lightbox-loaded-image"].waitForNonExistence(timeout: 5), app.debugDescription)

        let missingImageAttachment = app.descendants(matching: .any)["mac-comment-102-image-1"]
        XCTAssertTrue(missingImageAttachment.waitForExistence(timeout: 5), app.debugDescription)
        missingImageAttachment.click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-image-lightbox-error"].waitForExistence(timeout: 5), app.debugDescription)
        app.buttons["mac-image-lightbox-close-button"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-image-lightbox-error"].waitForNonExistence(timeout: 5), app.debugDescription)
    }

    func testDraftAssignsToRepoWithLabelsAndRefreshesIssues() {
        selectRootSection("Drafts")

        let assignButton = app.buttons["mac-draft-assign-draft-1"]
        XCTAssertTrue(assignButton.waitForExistence(timeout: 5), app.debugDescription)
        assignButton.click()
        let bugLabel = app.descendants(matching: .any)["mac-assign-draft-label-bug"]
        XCTAssertTrue(bugLabel.waitForExistence(timeout: 5), app.debugDescription)
        bugLabel.click()

        app.buttons["mac-assign-draft-submit-button"].click()
        XCTAssertTrue(assignButton.waitForNonExistence(timeout: 5), app.debugDescription)

        selectRootSection("Issues")
        XCTAssertTrue(app.textFields["mac-issues-search-field"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(issueRow("org/alpha", 88).waitForExistence(timeout: 5), app.debugDescription)
    }

    func testDraftAssignmentFailurePreservesChoices() {
        app.terminate()
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_DRAFT_ASSIGN_FAILURE"] = "1"
        app.launch()

        selectRootSection("Drafts")

        let assignButton = app.buttons["mac-draft-assign-draft-1"]
        XCTAssertTrue(assignButton.waitForExistence(timeout: 5), app.debugDescription)
        assignButton.click()
        let bugLabel = app.descendants(matching: .any)["mac-assign-draft-label-bug"]
        XCTAssertTrue(bugLabel.waitForExistence(timeout: 5), app.debugDescription)
        bugLabel.click()

        app.buttons["mac-assign-draft-submit-button"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-assign-draft-error"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.buttons["mac-assign-draft-submit-button"].exists, app.debugDescription)
        XCTAssertTrue(bugLabel.exists, app.debugDescription)
    }

    func testQuickCreateIssueWithLabelsRefreshesIssues() {
        selectRootSection("Drafts")

        let newIssueButton = app.buttons["mac-drafts-new-issue-button"]
        XCTAssertTrue(newIssueButton.waitForExistence(timeout: 5), app.debugDescription)
        newIssueButton.click()

        let titleField = app.textFields["mac-quick-create-title-field"]
        XCTAssertTrue(titleField.waitForExistence(timeout: 5), app.debugDescription)
        titleField.click()
        titleField.typeText("Quick mac issue")

        let bodyField = app.textViews["mac-quick-create-body-field"]
        XCTAssertTrue(bodyField.waitForExistence(timeout: 5), app.debugDescription)
        bodyField.click()
        bodyField.typeText("Created directly from Mac")

        let highPriority = app.descendants(matching: .any)["mac-quick-create-priority-picker"].radioButtons["High"]
        XCTAssertTrue(highPriority.waitForExistence(timeout: 5), app.debugDescription)
        highPriority.click()

        let bugLabel = app.descendants(matching: .any)["mac-quick-create-label-bug"]
        XCTAssertTrue(bugLabel.waitForExistence(timeout: 5), app.debugDescription)
        bugLabel.click()

        app.buttons["mac-quick-create-submit-button"].click()
        XCTAssertTrue(titleField.waitForNonExistence(timeout: 5), app.debugDescription)

        selectRootSection("Issues")
        XCTAssertTrue(issueRow("org/alpha", 89).waitForExistence(timeout: 5), app.debugDescription)
    }

    func testQuickCreateImageAttachmentRendersInCreatedIssue() {
        selectRootSection("Drafts")

        let newIssueButton = app.buttons["mac-drafts-new-issue-button"]
        XCTAssertTrue(newIssueButton.waitForExistence(timeout: 5), app.debugDescription)
        newIssueButton.click()

        let titleField = app.textFields["mac-quick-create-title-field"]
        XCTAssertTrue(titleField.waitForExistence(timeout: 5), app.debugDescription)
        titleField.click()
        titleField.typeText("Quick image issue")

        let bodyField = app.textViews["mac-quick-create-body-field"]
        XCTAssertTrue(bodyField.waitForExistence(timeout: 5), app.debugDescription)
        bodyField.click()
        bodyField.typeText("Before upload")

        app.buttons["mac-quick-create-image-attachment-button"].click()
        XCTAssertTrue(waitForValue(of: bodyField, containing: "![image](https://issuectl-ui-test.local/fixtures/uploaded.png)", timeout: 5), app.debugDescription)

        app.buttons["mac-quick-create-submit-button"].click()
        XCTAssertTrue(titleField.waitForNonExistence(timeout: 5), app.debugDescription)

        selectRootSection("Issues")
        let createdIssue = issueRow("org/alpha", 89)
        XCTAssertTrue(createdIssue.waitForExistence(timeout: 5), app.debugDescription)
        openIssue(createdIssue)

        let uploadedImage = app.descendants(matching: .any)["mac-issue-body-image-1"]
        XCTAssertTrue(uploadedImage.waitForExistence(timeout: 5), app.debugDescription)
        uploadedImage.click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-image-lightbox-loaded-image"].waitForExistence(timeout: 5), app.debugDescription)
    }

    func testQuickCreateFailurePreservesInput() {
        app.terminate()
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_QUICK_CREATE_FAILURE"] = "1"
        app.launch()

        selectRootSection("Drafts")

        let newIssueButton = app.buttons["mac-drafts-new-issue-button"]
        XCTAssertTrue(newIssueButton.waitForExistence(timeout: 5), app.debugDescription)
        newIssueButton.click()

        let titleField = app.textFields["mac-quick-create-title-field"]
        XCTAssertTrue(titleField.waitForExistence(timeout: 5), app.debugDescription)
        titleField.click()
        titleField.typeText("Preserved quick issue")

        let bugLabel = app.descendants(matching: .any)["mac-quick-create-label-bug"]
        XCTAssertTrue(bugLabel.waitForExistence(timeout: 5), app.debugDescription)
        bugLabel.click()

        app.buttons["mac-quick-create-submit-button"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-quick-create-error"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.buttons["mac-quick-create-submit-button"].exists, app.debugDescription)
        XCTAssertTrue(titleField.exists, app.debugDescription)
        XCTAssertTrue(bugLabel.exists, app.debugDescription)
    }

    func testParseIssuesCreatesAcceptedIssueAndRefreshesList() {
        selectRootSection("Drafts")

        app.buttons["mac-drafts-parse-ai-button"].click()
        let input = app.textViews["mac-parse-input-field"]
        XCTAssertTrue(input.waitForExistence(timeout: 5), app.debugDescription)
        input.click()
        input.typeText("Fix parsed alpha bug\nDocument parsed beta workflow")

        app.buttons["mac-parse-submit-button"].click()
        let firstParsedIssue = app.descendants(matching: .any)["mac-parse-issue-parsed-1-title"]
        XCTAssertTrue(firstParsedIssue.waitForExistence(timeout: 8), app.debugDescription)
        let secondParsedIssue = app.descendants(matching: .any)["mac-parse-issue-parsed-2-title"]
        XCTAssertTrue(secondParsedIssue.waitForExistence(timeout: 5), app.debugDescription)

        let createButton = app.buttons["mac-parse-create-button"]
        XCTAssertTrue(createButton.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(createButton.isEnabled, app.debugDescription)

        app.buttons["mac-parse-issue-parsed-2-accept-toggle"].click()
        XCTAssertTrue(createButton.isEnabled, app.debugDescription)
        createButton.click()

        let resultSummary = app.staticTexts["mac-parse-result-summary"]
        XCTAssertTrue(resultSummary.waitForExistence(timeout: 5), app.debugDescription)
        let resultText = (resultSummary.value as? String) ?? resultSummary.label
        XCTAssertTrue(resultText.contains("1 issue created"), "\(resultText)\n\(app.debugDescription)")

        app.buttons["mac-parse-done-button"].click()
        XCTAssertTrue(input.waitForNonExistence(timeout: 5), app.debugDescription)

        selectRootSection("Issues")
        XCTAssertTrue(issueRow("org/alpha", 90).waitForExistence(timeout: 5), app.debugDescription)
    }

    func testParseCreateFailurePreservesReviewState() {
        app.terminate()
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_PARSE_CREATE_FAILURE"] = "1"
        app.launch()

        selectRootSection("Drafts")

        app.buttons["mac-drafts-parse-ai-button"].click()
        let input = app.textViews["mac-parse-input-field"]
        XCTAssertTrue(input.waitForExistence(timeout: 5), app.debugDescription)
        input.click()
        input.typeText("Fix parsed alpha bug")

        app.buttons["mac-parse-submit-button"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-parse-issue-parsed-1-title"].waitForExistence(timeout: 8), app.debugDescription)
        let secondParsedIssue = app.descendants(matching: .any)["mac-parse-issue-parsed-2-title"]
        XCTAssertTrue(secondParsedIssue.waitForExistence(timeout: 5), app.debugDescription)
        app.buttons["mac-parse-issue-parsed-2-accept-toggle"].click()

        app.buttons["mac-parse-create-button"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-parse-error"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-parse-issue-parsed-1-title"].exists, app.debugDescription)
        XCTAssertTrue(app.buttons["mac-parse-create-button"].exists, app.debugDescription)
    }

    func testCommentImageAttachmentUploadsAndRenders() {
        let firstIssue = issueRow("org/alpha", 1)
        XCTAssertTrue(firstIssue.waitForExistence(timeout: 8), app.debugDescription)
        openIssue(firstIssue)

        let commentBody = app.textViews["mac-comment-composer-body-field"]
        XCTAssertTrue(commentBody.waitForExistence(timeout: 5), app.debugDescription)
        commentBody.click()
        commentBody.typeText("Comment before upload")

        app.buttons["mac-comment-composer-image-attachment-button"].click()
        XCTAssertTrue(waitForValue(of: commentBody, containing: "![image](https://issuectl-ui-test.local/fixtures/uploaded.png)", timeout: 5), app.debugDescription)

        app.buttons["mac-comment-composer-submit-button"].click()
        XCTAssertTrue(app.descendants(matching: .any)["mac-comment-501-image-1"].waitForExistence(timeout: 5), app.debugDescription)
    }

    func testImageAttachmentFailurePreservesCommentText() {
        app.terminate()
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_IMAGE_UPLOAD_FAILURE"] = "1"
        app.launch()

        let firstIssue = issueRow("org/alpha", 1)
        XCTAssertTrue(firstIssue.waitForExistence(timeout: 8), app.debugDescription)
        openIssue(firstIssue)

        let commentBody = app.textViews["mac-comment-composer-body-field"]
        XCTAssertTrue(commentBody.waitForExistence(timeout: 5), app.debugDescription)
        commentBody.click()
        commentBody.typeText("Keep this comment")

        app.buttons["mac-comment-composer-image-attachment-button"].click()
        XCTAssertTrue(app.staticTexts["mac-comment-composer-image-attachment-error"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(waitForValue(of: commentBody, containing: "Keep this comment", timeout: 3), app.debugDescription)
        XCTAssertTrue(app.buttons["mac-comment-composer-submit-button"].exists, app.debugDescription)
    }

    func testStatusMenuOpensSettings() {
        openSettingsFromStatusMenu()

        let settingsView = app.descendants(matching: .any)["mac-settings-view"]
        XCTAssertTrue(settingsView.waitForExistence(timeout: 5), app.debugDescription)
    }

    func testSettingsShowsNativeRepositoryManagement() {
        openSettings()

        XCTAssertTrue(app.buttons["mac-settings-add-repository-button"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.buttons["mac-settings-refresh-repositories-button"].waitForExistence(timeout: 3), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-settings-repository-row-org/alpha"].waitForExistence(timeout: 5), app.debugDescription)

        app.buttons["mac-settings-add-repository-button"].click()
        XCTAssertTrue(app.textFields["mac-add-repo-full-name-field"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.buttons["mac-add-repo-browse-row-org/gamma"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.buttons["mac-add-repo-submit-button"].waitForExistence(timeout: 3), app.debugDescription)
        app.buttons["Cancel"].click()
    }

    func testSettingsShowsConnectionAndSavesAdvancedSettings() {
        openSettings()

        XCTAssertTrue(app.descendants(matching: .any)["mac-settings-connection-status"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.buttons["mac-settings-edit-connection-button"].waitForExistence(timeout: 3), app.debugDescription)
        XCTAssertTrue(app.buttons["mac-settings-reconnect-local-button"].waitForExistence(timeout: 3), app.debugDescription)
        XCTAssertTrue(app.buttons["mac-settings-disconnect-button"].waitForExistence(timeout: 3), app.debugDescription)

        let cacheTTL = app.textFields["mac-settings-cache-ttl-field"]
        XCTAssertTrue(cacheTTL.waitForExistence(timeout: 5), app.debugDescription)
        cacheTTL.click()
        cacheTTL.typeKey("a", modifierFlags: .command)
        cacheTTL.typeText("600")

        let saveButton = app.buttons["mac-settings-save-advanced-button"]
        XCTAssertTrue(saveButton.waitForExistence(timeout: 5), app.debugDescription)
        saveButton.click()

        XCTAssertFalse(app.descendants(matching: .any)["mac-settings-advanced-save-error"].waitForExistence(timeout: 1), app.debugDescription)
    }

    func testSettingsShowsWorktreesAndCleansStaleRows() {
        openSettings()

        XCTAssertTrue(app.descendants(matching: .any)["mac-settings-worktrees-summary"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-settings-worktree-row-alpha-worktree-101"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-settings-worktree-row-alpha-worktree-stale"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertFalse(app.buttons["mac-settings-cleanup-worktree-alpha-worktree-101"].exists, app.debugDescription)

        let cleanupStale = app.buttons["mac-settings-cleanup-stale-worktrees-button"]
        XCTAssertTrue(cleanupStale.waitForExistence(timeout: 5), app.debugDescription)
        cleanupStale.click()

        XCTAssertTrue(app.descendants(matching: .any)["mac-settings-worktree-row-alpha-worktree-stale"].waitForNonExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-settings-worktree-row-alpha-worktree-101"].waitForExistence(timeout: 3), app.debugDescription)
        XCTAssertFalse(app.descendants(matching: .any)["mac-settings-worktrees-action-error"].exists, app.debugDescription)
    }

    func testSettingsCleansIndividualStaleWorktree() {
        openSettings()

        XCTAssertTrue(app.descendants(matching: .any)["mac-settings-worktree-row-alpha-worktree-stale"].waitForExistence(timeout: 5), app.debugDescription)

        let cleanup = app.buttons["mac-settings-cleanup-worktree-alpha-worktree-stale"]
        XCTAssertTrue(cleanup.waitForExistence(timeout: 5), app.debugDescription)
        cleanup.click()

        XCTAssertTrue(app.descendants(matching: .any)["mac-settings-worktree-row-alpha-worktree-stale"].waitForNonExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-settings-worktree-row-alpha-worktree-101"].waitForExistence(timeout: 3), app.debugDescription)
        XCTAssertFalse(app.descendants(matching: .any)["mac-settings-worktrees-action-error"].exists, app.debugDescription)
    }

    func testSettingsWorktreeCleanupFailureKeepsRowsAndShowsError() {
        app.terminate()
        app.launchEnvironment["ISSUECTL_MAC_UI_FIXTURE_WORKTREE_CLEANUP_FAILURE"] = "1"
        app.launch()

        openSettings()

        XCTAssertTrue(app.descendants(matching: .any)["mac-settings-worktree-row-alpha-worktree-stale"].waitForExistence(timeout: 5), app.debugDescription)

        let cleanupStale = app.buttons["mac-settings-cleanup-stale-worktrees-button"]
        XCTAssertTrue(cleanupStale.waitForExistence(timeout: 5), app.debugDescription)
        cleanupStale.click()

        XCTAssertTrue(app.descendants(matching: .any)["mac-settings-worktrees-action-error"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.descendants(matching: .any)["mac-settings-worktree-row-alpha-worktree-stale"].waitForExistence(timeout: 3), app.debugDescription)
    }

    private func openSettings() {
        app.typeKey(",", modifierFlags: .command)

        let settingsView = app.descendants(matching: .any)["mac-settings-view"]
        if settingsView.waitForExistence(timeout: 2) {
            return
        }

        openSettingsFromStatusMenu()
    }

    private func openSettingsFromStatusMenu() {
        let statusItem = app.statusItems["IssueCTL"].firstMatch
        XCTAssertTrue(statusItem.waitForExistence(timeout: 8), app.debugDescription)

        statusItem.click()
        let settingsItem = app.menuItems["Settings..."].firstMatch
        XCTAssertTrue(settingsItem.waitForExistence(timeout: 3), app.debugDescription)
        settingsItem.click()
    }

    private func issueRow(_ repoFullName: String, _ number: Int) -> XCUIElement {
        app.descendants(matching: .any)["mac-issue-row-\(repoFullName)-\(number)"]
    }

    private func draftRow(_ id: String) -> XCUIElement {
        app.descendants(matching: .any)["mac-draft-row-\(id)"]
    }

    private func prRow(_ repoFullName: String, _ number: Int) -> XCUIElement {
        app.descendants(matching: .any)["mac-pr-row-\(repoFullName)-\(number)"]
    }

    private func issueState(_ title: String) -> XCUIElement {
        app.descendants(matching: .any)["mac-issues-section-picker"].radioButtons[title]
    }

    private func issueSort(_ title: String) -> XCUIElement {
        app.descendants(matching: .any)["mac-issues-sort-picker"].radioButtons[title]
    }

    private func prSection(_ title: String) -> XCUIElement {
        app.descendants(matching: .any)["mac-prs-section-picker"].radioButtons[title]
    }

    private func prSort(_ title: String) -> XCUIElement {
        app.descendants(matching: .any)["mac-prs-sort-picker"].radioButtons[title]
    }

    private func openIssue(_ issue: XCUIElement) {
        issue.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()
        let editButton = app.buttons["mac-issue-detail-edit-button"]
        if !editButton.waitForExistence(timeout: 2) {
            issue.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()
        }
    }

    private func openPullRequest(_ pullRequest: XCUIElement) {
        pullRequest.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()
        let doneButton = app.buttons["mac-pr-detail-done-button"]
        if !doneButton.waitForExistence(timeout: 2) {
            pullRequest.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()
        }
    }

    private func rootSection(_ title: String) -> XCUIElement {
        app.descendants(matching: .any)["mac-sidebar-section-picker"].radioButtons[title].firstMatch
    }

    private func selectRootSection(_ title: String) {
        let section = rootSection(title)
        XCTAssertTrue(section.waitForExistence(timeout: 5), app.debugDescription)
        section.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()
    }

    private func waitForValue(of element: XCUIElement, containing text: String, timeout: TimeInterval) -> Bool {
        let predicate = NSPredicate { candidate, _ in
            guard let element = candidate as? XCUIElement else { return false }
            let value = (element.value as? String) ?? element.label
            return value.contains(text)
        }
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: element)
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }
}
