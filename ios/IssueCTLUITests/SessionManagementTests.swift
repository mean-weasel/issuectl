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
        assertElement("sessions-command-header", existsIn: app, timeout: 5)
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
    func testSessionCardShowsExpandableTerminalPreview() {
        server.seedActiveDeployment()
        let app = launchApp(server: server)

        tapMainTab("active-tab", label: "Active", in: app)
        assertElement("sessions-command-header", existsIn: app, timeout: 5)
        assertElement("session-preview-9001", existsIn: app, timeout: 5)
        let preview = element("session-preview-9001", in: app)

        XCTAssertTrue(
            app.staticTexts["pass: launch handoff"].waitForExistence(timeout: 5),
            "Collapsed session preview did not show latest output\n\(app.debugDescription)"
        )
        XCTAssertTrue(
            app.staticTexts["Active"].waitForExistence(timeout: 3),
            "Session preview did not show a visible active status badge\n\(app.debugDescription)"
        )
        XCTAssertTrue(
            String(describing: preview.value ?? "").contains("pass: launch handoff"),
            "Session preview accessibility value did not include latest output"
        )

        preview.tap()
        XCTAssertTrue(
            app.staticTexts["issue #101: running checks"].waitForExistence(timeout: 3),
            "Expanded session preview did not show captured terminal lines\n\(app.debugDescription)"
        )
    }

    @MainActor
    func testSessionHeaderCountsActiveAndIdleTerminalPreviews() {
        server.seedMixedActivityDeployments()
        let app = launchApp(server: server)

        tapMainTab("active-tab", label: "Active", in: app)
        assertElement("sessions-command-header", existsIn: app, timeout: 5)
        XCTAssertTrue(
            app.staticTexts["2 active • 1 idle"].waitForExistence(timeout: 8),
            "Expected Sessions subtitle to count active and idle terminal previews\n\(app.debugDescription)"
        )
    }

    @MainActor
    func testSessionHeaderShowsCheckingForMissingTerminalPreview() {
        server.seedDeploymentWithMissingPreview()
        let app = launchApp(server: server)

        tapMainTab("active-tab", label: "Active", in: app)
        assertElement("sessions-command-header", existsIn: app, timeout: 5)
        XCTAssertTrue(
            app.staticTexts["0 active • 0 idle • 1 checking"].waitForExistence(timeout: 8),
            "Expected Sessions subtitle to show ready terminals waiting for preview data\n\(app.debugDescription)"
        )
    }
}
