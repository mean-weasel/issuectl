import XCTest

final class IssueCTLUITests: XCTestCase {
    var server: MockIssueCTLServer!

    override func setUpWithError() throws {
        continueAfterFailure = false
        server = try MockIssueCTLServer()
        try server.start()
    }

    override func tearDownWithError() throws {
        server.stop()
        server = nil
    }

    @MainActor
    func testCommandCenterActionsAreReachableFromTabs() {
        let app = launchApp(server: server)

        assertElement("today-create-issue-button", existsIn: app, timeout: 8)
        assertElement("today-metric-sessions", existsIn: app, timeout: 5)
        assertElement("today-metric-prs", existsIn: app, timeout: 5)
        assertElement("today-metric-issues", existsIn: app, timeout: 5)

        openSettingsFromToday(in: app)
        closeSettings(in: app)

        element("today-search-button", in: app).tap()
        assertElement("today-search-field", existsIn: app, timeout: 3)
        assertElement("today-search-issue-101", existsIn: app)
        assertElement("today-search-pr-7", existsIn: app)
        app.buttons["today-search-cancel-button"].tap()
        waitForNonexistence("today-search-field", in: app)

        element("today-create-issue-button", in: app).tap()
        assertElement("issue-title-field", existsIn: app, timeout: 3)
        app.buttons["cancel-button"].tap()
        waitForNonexistence("issue-title-field", in: app)
    }

    @MainActor
    func testListToolbarActionsAreReachableFromTabs() {
        let app = launchApp(server: server)

        tapMainTab("issues-tab", label: "Issues", in: app)
        assertElement("issues-create-issue-button", existsIn: app, timeout: 5)
        assertElement("issues-search-button", existsIn: app)
        assertElement("issues-filter-button", existsIn: app)
        element("issues-search-button", in: app).tap()
        assertElement("issues-search-field", existsIn: app, timeout: 3)
        app.buttons["Cancel"].tap()
        waitForNonexistence("issues-search-field", in: app)

        tapMainTab("prs-tab", label: "PRs", in: app)
        assertElement("prs-create-issue-button", existsIn: app, timeout: 5)
        assertElement("prs-search-button", existsIn: app)
        assertElement("prs-filter-button", existsIn: app)
        element("prs-search-button", in: app).tap()
        assertElement("prs-search-field", existsIn: app, timeout: 3)
        app.buttons["Cancel"].tap()
        waitForNonexistence("prs-search-field", in: app)

        tapMainTab("active-tab", label: "Active", in: app)
        assertElement("sessions-create-issue-button", existsIn: app, timeout: 5)
        assertElement("sessions-search-button", existsIn: app)
        assertElement("sessions-refresh-button", existsIn: app)
        element("sessions-search-button", in: app).tap()
        assertElement("sessions-search-field", existsIn: app, timeout: 3)
        app.buttons["Cancel"].tap()
        waitForNonexistence("sessions-search-field", in: app)
    }

    @MainActor
    func testRepoContextIsVisibleAcrossPrimaryTabs() {
        server.seedSecondRepo()
        server.seedActiveDeployment()
        let app = launchApp(server: server)

        assertRepoContext("All 2", in: app)

        tapElement("issues-tab", in: app)
        assertElement("issue-row-102", existsIn: app, timeout: 8)
        assertRepoContext("All 2", in: app)

        tapElement("prs-tab", in: app)
        assertElement("pr-row-7", existsIn: app, timeout: 8)
        assertRepoContext("All 2", in: app)

        tapElement("active-tab", in: app)
        assertElement("sessions-command-header", existsIn: app, timeout: 8)
        assertRepoContext("All 2", in: app)
        let activeContext = element("repo-context-active", in: app)
        XCTAssertTrue(activeContext.waitForExistence(timeout: 3), "Active repo context missing\n\(app.debugDescription)")
        XCTAssertTrue(activeContext.label.contains("1"), "Expected one active repo context, got \(activeContext.label)")
    }

    @MainActor
    func testRecoveryOpenSettingsActionsRouteFromListErrors() {
        server.failRepos = true
        let app = launchApp(server: server)

        tapElement("issues-tab", in: app)
        openSettingsFromRecovery(in: app)

        tapElement("prs-tab", in: app)
        openSettingsFromRecovery(in: app)
    }

    @MainActor
    func testRecoveryOpenSettingsActionRoutesFromSessionError() {
        server.failDeployments = true
        let app = launchApp(server: server)

        tapElement("active-tab", in: app)
        openSettingsFromRecovery(in: app)
    }

    @MainActor
    func testIssueAndPullRowsAreImmediatelyVisibleBelowSectionPicker() {
        let app = launchApp(server: server)

        tapElement("issues-tab", in: app)
        let issueRow = element("issue-row-101", in: app)
        XCTAssertTrue(issueRow.waitForExistence(timeout: 8), app.debugDescription)
        XCTAssertTrue(issueRow.isHittable, "Issue row should be visible without scrolling\n\(app.debugDescription)")

        tapElement("prs-tab", in: app)
        let prRow = element("pr-row-7", in: app)
        XCTAssertTrue(prRow.waitForExistence(timeout: 8), app.debugDescription)
        XCTAssertTrue(prRow.isHittable, "PR row should be visible without scrolling\n\(app.debugDescription)")
    }

    @MainActor
    func testCreateMinimalDraftIssueFromThumbReachEntryPoint() {
        let draftTitle = "CI draft"
        let app = launchApp(server: server)

        assertElement("today-create-issue-button", existsIn: app, timeout: 8)
        element("today-create-issue-button", in: app).tap()

        createLocalDraft(title: draftTitle, body: nil, priority: nil, in: app)

        openDraftsSection(in: app)
        assertElement("draft-row-draft-ui-1", existsIn: app, timeout: 8)
        XCTAssertEqual(element("draft-row-draft-ui-1-title", in: app).label, draftTitle)
        openIssuesSection(in: app)
    }

    @MainActor
    func testCreateDetailedDraftIssueFromThumbReachEntryPoint() {
        let draftTitle = "Test draft issue from automation"
        let app = launchApp(server: server)

        assertElement("today-create-issue-button", existsIn: app, timeout: 8)
        element("today-create-issue-button", in: app).tap()

        createLocalDraft(
            title: draftTitle,
            body: "This is a test draft created via workflow automation.",
            priority: "High",
            in: app
        )

        openDraftsSection(in: app)
        assertElement("draft-row-draft-ui-1", existsIn: app, timeout: 8)
        XCTAssertEqual(element("draft-row-draft-ui-1-title", in: app).label, draftTitle)
        openIssuesSection(in: app)
    }

    @MainActor
    private func createLocalDraft(
        title: String,
        body: String?,
        priority: String?,
        in app: XCUIApplication
    ) {
        assertElement("issue-title-field", existsIn: app, timeout: 3)
        element("quick-create-repo-more-button", in: app).tap()
        let localDraftButton = app.buttons["quick-create-local-draft-button"]
        if localDraftButton.waitForExistence(timeout: 3) {
            localDraftButton.tap()
        } else {
            app.buttons["quick-create-local-draft-option"].tap()
        }

        element("issue-title-field", in: app).tap()
        app.typeText(title)

        if let body {
            element("issue-body-editor", in: app).tap()
            app.typeText(body)
        }

        if let priority {
            element("quick-create-more-options", in: app).tap()
            app.buttons[priority].tap()
        }

        element("submit-issue-button", in: app).tap()
        waitForNonexistence("issue-title-field", in: app)
    }

    @MainActor
    private func openDraftsSection(in app: XCUIApplication) {
        tapMainTab("issues-tab", label: "Issues", in: app)
        assertElement("section-tab-drafts", existsIn: app, timeout: 8)
        element("section-tab-drafts", in: app).tap()
    }

    @MainActor
    func testTodayActiveSessionsThumbButtonOpensSessions() {
        server.seedActiveDeployment()
        let app = launchApp(server: server)

        assertElement("today-active-sessions-button", existsIn: app, timeout: 8)
        element("today-active-sessions-button", in: app).tap()

        assertElement("sessions-command-header", existsIn: app, timeout: 5)
        assertElement("session-reenter-terminal-9001", existsIn: app)
    }

    @MainActor
    func testLaunchingIssueCanBeReenteredFromActiveSessions() {
        let app = launchApp(server: server)

        openIssuesSection(in: app)
        assertElement("issue-row-101", existsIn: app, timeout: 8)
        element("issue-row-101", in: app).tap()

        assertElement("issue-detail-launch-button", existsIn: app, timeout: 5)
        element("issue-detail-launch-button", in: app).tap()

        assertElement("launch-recommended-button", existsIn: app, timeout: 5)
        element("launch-recommended-button", in: app).tap()

        XCTAssertTrue(app.buttons["terminal-done-button"].waitForExistence(timeout: 8), app.debugDescription)
        app.buttons["terminal-done-button"].tap()
        assertElement("issue-detail-reenter-terminal-button", existsIn: app, timeout: 5)

        tapMainTab("active-tab", label: "Active", in: app)
        assertElement("sessions-command-header", existsIn: app, timeout: 5)
        assertElement("session-reenter-terminal-9001", existsIn: app, timeout: 5)
        element("session-reenter-terminal-9001", in: app).tap()

        XCTAssertTrue(app.buttons["terminal-done-button"].waitForExistence(timeout: 5), app.debugDescription)
        app.buttons["terminal-done-button"].tap()
    }

    @MainActor
    func testCodexLaunchSelectionIsSentToServer() {
        server.defaultLaunchAgent = "codex"
        let app = launchApp(server: server)

        openIssuesSection(in: app)
        assertElement("issue-row-101", existsIn: app, timeout: 8)
        element("issue-row-101", in: app).tap()

        assertElement("issue-detail-launch-button", existsIn: app, timeout: 5)
        element("issue-detail-launch-button", in: app).tap()

        assertElement("launch-recommended-button", existsIn: app, timeout: 5)
        element("launch-recommended-button", in: app).tap()

        XCTAssertTrue(app.buttons["terminal-done-button"].waitForExistence(timeout: 8), app.debugDescription)
        XCTAssertEqual(server.lastLaunchAgent, "codex")
        app.buttons["terminal-done-button"].tap()
    }

    @MainActor
    func testMultipleLaunchedIssueSessionsRemainAvailableFromActiveSessions() {
        let app = launchApp(server: server)

        openIssuesSection(in: app)
        launchIssueSession(101, in: app)
        backToIssueList(in: app, expectingIssue: 102)

        launchIssueSession(102, in: app)

        tapMainTab("active-tab", label: "Active", in: app)
        assertElement("sessions-command-header", existsIn: app, timeout: 5)
        assertElement("session-reenter-terminal-9001", existsIn: app, timeout: 5)
        assertElement("session-reenter-terminal-9002", existsIn: app, timeout: 5)
        XCTAssertTrue(element("session-reenter-terminal-9001", in: app).isEnabled)
        XCTAssertTrue(element("session-reenter-terminal-9002", in: app).isEnabled)
    }

    @MainActor
    func testRunningIssueDetailShowsReentryInsteadOfLaunch() {
        server.seedActiveDeployment()
        let app = launchApp(server: server)

        openIssuesSection(in: app)
        let runningSegment = element("section-tab-running", in: app)
        XCTAssertTrue(runningSegment.waitForExistence(timeout: 5), app.debugDescription)
        runningSegment.tap()
        assertElement("issue-row-101", existsIn: app, timeout: 8)
        element("issue-row-101", in: app).tap()

        assertElement("issue-detail-reenter-terminal-button", existsIn: app, timeout: 5)
        XCTAssertFalse(element("issue-detail-launch-button", in: app).exists, app.debugDescription)

        element("issue-detail-reenter-terminal-button", in: app).tap()
        XCTAssertTrue(app.buttons["terminal-done-button"].waitForExistence(timeout: 5), app.debugDescription)
    }

    @MainActor
    func testUserProfileFailureDoesNotBlockPrimaryLists() {
        server.failUserProfile = true
        let app = launchApp(server: server)

        openIssuesSection(in: app)
        assertElement("issue-row-101", existsIn: app, timeout: 8)
        XCTAssertFalse(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "user profile")).firstMatch.exists)

        tapMainTab("prs-tab", label: "PRs", in: app)
        assertElement("pr-row-7", existsIn: app, timeout: 8)
        XCTAssertFalse(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "user profile")).firstMatch.exists)
    }

    @MainActor
    private func launchIssueSession(_ number: Int, in app: XCUIApplication) {
        assertElement("issue-row-\(number)", existsIn: app, timeout: 8)
        element("issue-row-\(number)", in: app).tap()

        assertElement("issue-detail-launch-button", existsIn: app, timeout: 5)
        element("issue-detail-launch-button", in: app).tap()

        assertElement("launch-recommended-button", existsIn: app, timeout: 5)
        element("launch-recommended-button", in: app).tap()

        XCTAssertTrue(app.buttons["terminal-done-button"].waitForExistence(timeout: 8), app.debugDescription)
        app.buttons["terminal-done-button"].tap()
        assertElement("issue-detail-reenter-terminal-button", existsIn: app, timeout: 5)
    }

    @MainActor
    private func backToIssueList(in app: XCUIApplication, expectingIssue number: Int) {
        if !element("issue-row-\(number)", in: app).exists {
            app.navigationBars.buttons.firstMatch.tap()
        }
        assertElement("issue-row-\(number)", existsIn: app, timeout: 5)
    }
}
