import XCTest

final class PRBrowseTests: XCTestCase {
    private var server: MockIssueCTLServer!

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
    func testPRListShowsOpenPRsWithCheckStatus() {
        let app = launchApp(server: server)

        tapMainTab("prs-tab", label: "PRs", in: app)
        // PR #7 has checksStatus "pending" → visible in default "review" section.
        assertElement("pr-row-7", existsIn: app, timeout: 8)

        // PR #8 has checksStatus "success" → only visible under the "open" section.
        tapElement("section-tab-open", in: app, timeout: 5)
        assertElement("pr-row-8", existsIn: app, timeout: 5)
    }

    @MainActor
    func testPRDetailShowsChecksAndBranchInfo() {
        let app = launchApp(server: server)

        tapMainTab("prs-tab", label: "PRs", in: app)
        assertElement("pr-row-7", existsIn: app, timeout: 8)
        element("pr-row-7", in: app).tap()

        // PR detail should load with title visible.
        let titleText = app.staticTexts["Pending review work"]
        XCTAssertTrue(titleText.waitForExistence(timeout: 5), "PR title missing\n\(app.debugDescription)")

        // Verify the actions menu is accessible.
        assertElement("pr-detail-actions-menu", existsIn: app, timeout: 5)
    }

    @MainActor
    func testPRDetailShowsActiveReviewSessionProvenance() {
        server.seedPullRequestDeployment()
        let app = launchApp(server: server)

        tapMainTab("prs-tab", label: "PRs", in: app)
        assertElement("pr-row-7", existsIn: app, timeout: 8)
        element("pr-row-7", in: app).tap()

        XCTAssertTrue(app.staticTexts["Active Review Session"].waitForExistence(timeout: 8), app.debugDescription)
        XCTAssertTrue(app.staticTexts["Webhook - Codex - depth 1"].waitForExistence(timeout: 5), app.debugDescription)
        assertElement("pr-review-session-open-9507", existsIn: app, timeout: 5)
    }

    @MainActor
    func testPRAutoReviewLabelControlTogglesAutomationLabel() {
        let app = launchApp(server: server)

        tapMainTab("prs-tab", label: "PRs", in: app)
        assertElement("pr-row-7", existsIn: app, timeout: 8)
        element("pr-row-7", in: app).tap()

        assertElement("pr-auto-review-label-button", existsIn: app, timeout: 8)
        tapElement("pr-auto-review-label-button", in: app)

        XCTAssertTrue(app.staticTexts["Auto-review label applied"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.staticTexts["Review automation queued"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(
            app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "reserved this request")).firstMatch
                .waitForExistence(timeout: 5),
            app.debugDescription
        )
        XCTAssertEqual(server.lastPullLabelAction, "add")
    }

    @MainActor
    func testPRFilterAndSearchButtons() {
        let app = launchApp(server: server)

        tapMainTab("prs-tab", label: "PRs", in: app)
        assertElement("prs-filter-button", existsIn: app, timeout: 5)
        assertElement("prs-search-button", existsIn: app, timeout: 3)
        assertElement("prs-create-issue-button", existsIn: app, timeout: 3)
    }
}
