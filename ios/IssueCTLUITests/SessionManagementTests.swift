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

        tapElement("active-tab", in: app)
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
}
