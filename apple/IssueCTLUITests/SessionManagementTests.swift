// ios/IssueCTLUITests/SessionManagementTests.swift
import XCTest

final class SessionManagementTests: XCTestCase {
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
    func testEndSessionFromActiveTab() {
        server.seedActiveDeployment()
        let app = launchApp(server: server)

        tapMainTab("active-tab", label: "Active", in: app)
        assertElement("session-reenter-terminal-9001", existsIn: app, timeout: 5)

        // Tap session controls to open the control sheet.
        assertElement("session-controls-9001", existsIn: app, timeout: 3)
        element("session-controls-9001", in: app).tap()

        // Tap End Session in the sheet (no confirmation dialog — direct destructive action).
        let endButton = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "End Session")).firstMatch
        XCTAssertTrue(endButton.waitForExistence(timeout: 3), "End Session button missing\n\(app.debugDescription)")
        endButton.tap()

        // Session should disappear from the list.
        waitForNonexistence("session-reenter-terminal-9001", in: app, timeout: 8)
    }

    @MainActor
    func testSessionCardOmitsTerminalPreviewOutput() {
        server.seedActiveDeployment()
        let app = launchApp(server: server)

        tapMainTab("active-tab", label: "Active", in: app)
        assertElement("session-reenter-terminal-9001", existsIn: app, timeout: 5)

        XCTAssertTrue(
            app.staticTexts["Running"].waitForExistence(timeout: 5),
            "Session card did not show running status\n\(app.debugDescription)"
        )
        XCTAssertFalse(
            app.staticTexts["pass: launch handoff"].waitForExistence(timeout: 2),
            "Session card should not render terminal preview output\n\(app.debugDescription)"
        )
        XCTAssertFalse(
            app.staticTexts["issue #101: running checks"].waitForExistence(timeout: 2),
            "Session card should not render expanded terminal preview lines\n\(app.debugDescription)"
        )
    }

    @MainActor
    func testIdleSessionsSortToTop() {
        server.seedMixedActivityDeployments()
        let app = launchApp(server: server)

        tapMainTab("active-tab", label: "Active", in: app)
        assertElement("session-reenter-terminal-9001", existsIn: app, timeout: 5)
        assertElement("session-reenter-terminal-9002", existsIn: app, timeout: 5)
        assertElement("session-reenter-terminal-9003", existsIn: app, timeout: 5)

        XCTAssertTrue(
            app.staticTexts["Idle"].waitForExistence(timeout: 8),
            "Expected idle status to appear after preview polling\n\(app.debugDescription)"
        )

        let idleFrame = element("session-reenter-terminal-9002", in: app).frame
        let firstActiveFrame = element("session-reenter-terminal-9001", in: app).frame
        let secondActiveFrame = element("session-reenter-terminal-9003", in: app).frame
        XCTAssertLessThan(idleFrame.minY, firstActiveFrame.minY, "Idle session should sort before active sessions")
        XCTAssertLessThan(idleFrame.minY, secondActiveFrame.minY, "Idle session should sort before active sessions")
    }

    @MainActor
    func testSessionHeaderOmitsPreviewStats() {
        server.seedDeploymentWithMissingPreview()
        let app = launchApp(server: server)

        tapMainTab("active-tab", label: "Active", in: app)
        XCTAssertTrue(
            app.staticTexts["Running sessions"].waitForExistence(timeout: 5),
            "Expected simplified Sessions subtitle\n\(app.debugDescription)"
        )
        XCTAssertFalse(
            app.staticTexts["0 active • 0 idle • 1 checking"].waitForExistence(timeout: 2),
            "Sessions subtitle should not render preview stats\n\(app.debugDescription)"
        )
    }

    @MainActor
    func testRepoContextChipOpensSessionFiltersAndFiltersRunningSessions() {
        server.seedDeploymentsAcrossRepos()
        let app = launchApp(server: server)

        tapMainTab("active-tab", label: "Active", in: app)
        assertElement("session-reenter-terminal-9001", existsIn: app, timeout: 5)
        assertElement("session-reenter-terminal-9101", existsIn: app, timeout: 5)

        assertElement("repo-context-filter-button", existsIn: app, timeout: 5)
        element("repo-context-filter-button", in: app).tap()

        XCTAssertTrue(app.staticTexts["Filters"].waitForExistence(timeout: 3), app.debugDescription)
        app.buttons["beta, org"].tap()

        XCTAssertTrue(app.staticTexts["Showing beta"].waitForExistence(timeout: 3), app.debugDescription)
        app.swipeDown()

        waitForNonexistence("session-reenter-terminal-9001", in: app, timeout: 5)
        assertElement("session-reenter-terminal-9101", existsIn: app, timeout: 5)
    }
}
