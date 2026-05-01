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

        // Open settings from Today.
        assertElement("today-settings-button", existsIn: app, timeout: 8)
        element("today-settings-button", in: app).tap()
        assertElement("settings-done-button", existsIn: app, timeout: 3)

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

        assertElement("today-settings-button", existsIn: app, timeout: 8)
        element("today-settings-button", in: app).tap()
        assertElement("settings-done-button", existsIn: app, timeout: 3)

        // Verify server URL is displayed (serverURL contains "127.0.0.1").
        let serverText = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "127.0.0.1")).firstMatch
        XCTAssertTrue(serverText.waitForExistence(timeout: 5), "Server URL not shown in settings\n\(app.debugDescription)")

        // Verify repo full name is listed (org/alpha).
        let repoText = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "org/alpha")).firstMatch
        XCTAssertTrue(repoText.waitForExistence(timeout: 5), "Repo not shown in settings\n\(app.debugDescription)")

        // Dismiss settings.
        app.buttons["settings-done-button"].tap()
        waitForButtonNonexistence("settings-done-button", in: app)
    }
}
