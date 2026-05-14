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

    private func issueState(_ title: String) -> XCUIElement {
        app.descendants(matching: .any)["mac-issues-section-picker"].radioButtons[title]
    }

    private func issueSort(_ title: String) -> XCUIElement {
        app.descendants(matching: .any)["mac-issues-sort-picker"].radioButtons[title]
    }

    private func rootSection(_ title: String) -> XCUIElement {
        app.descendants(matching: .any)["mac-sidebar-section-picker"].radioButtons[title].firstMatch
    }

    private func selectRootSection(_ title: String) {
        let section = rootSection(title)
        XCTAssertTrue(section.waitForExistence(timeout: 5), app.debugDescription)
        section.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).click()
    }
}
