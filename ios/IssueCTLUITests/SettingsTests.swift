// ios/IssueCTLUITests/SettingsTests.swift
import XCTest

final class SettingsTests: XCTestCase {
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
    func testDisconnectShowsOnboarding() {
        let app = launchApp(server: server)

        openSettingsFromToday(in: app)

        // Scroll to find the Disconnect button at bottom of settings sheet.
        let disconnectButton = app.buttons.matching(NSPredicate(format: "label == %@", "Disconnect")).firstMatch
        if !disconnectButton.waitForExistence(timeout: 2) {
            app.swipeUp()
        }
        XCTAssertTrue(disconnectButton.waitForExistence(timeout: 5), "Disconnect button missing\n\(app.debugDescription)")
        disconnectButton.tap()

        // Confirmation dialog — tap Disconnect (the destructive action button).
        let confirmButton = app.buttons.matching(NSPredicate(format: "label == %@", "Disconnect")).firstMatch
        XCTAssertTrue(confirmButton.waitForExistence(timeout: 5), "Disconnect confirmation missing\n\(app.debugDescription)")
        confirmButton.tap()

        // App should show the onboarding screen (navigation title "Setup" and Connect button).
        let connectButton = app.buttons.matching(NSPredicate(format: "label == %@", "Connect")).firstMatch
        XCTAssertTrue(connectButton.waitForExistence(timeout: 5),
                      "Onboarding not shown after disconnect\n\(app.debugDescription)")
    }

    @MainActor
    func testSettingsShowsServerInfoAndRepos() {
        let app = launchApp(server: server)

        openSettingsFromToday(in: app)

        // Verify server URL is displayed (serverURL contains "127.0.0.1").
        let serverText = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "127.0.0.1")).firstMatch
        XCTAssertTrue(serverText.waitForExistence(timeout: 5), "Server URL not shown in settings\n\(app.debugDescription)")

        // Verify repo full name is listed (org/alpha).
        let repoText = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "org/alpha")).firstMatch
        XCTAssertTrue(repoText.waitForExistence(timeout: 5), "Repo not shown in settings\n\(app.debugDescription)")

        closeSettings(in: app)
    }

    @MainActor
    func testWorktreesCleanupRequiresConfirmation() {
        let app = launchApp(server: server)

        openSettingsFromToday(in: app)
        openWorktreesFromSettings(in: app)
        XCTAssertTrue(app.staticTexts["Cleanup Available"].waitForExistence(timeout: 5), app.debugDescription)

        let cleanupButton = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Clean Up Stale Worktrees")).firstMatch
        XCTAssertTrue(cleanupButton.waitForExistence(timeout: 5), "Stale cleanup button missing\n\(app.debugDescription)")
        cleanupButton.tap()
        let confirmButton = app.buttons["Clean Up 1 Stale"]
        XCTAssertTrue(confirmButton.waitForExistence(timeout: 3), "Stale cleanup confirmation missing\n\(app.debugDescription)")
        confirmButton.tap()

        XCTAssertTrue(app.staticTexts["Worktrees Clear"].waitForExistence(timeout: 5), app.debugDescription)
    }
}
