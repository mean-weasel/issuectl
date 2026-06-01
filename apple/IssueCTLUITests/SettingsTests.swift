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
    func testRepoEditorShowsAutomationWebhookAndLabelControls() {
        let app = launchApp(server: server)

        openSettingsFromToday(in: app)
        openAlphaRepoEditor(in: app)

        assertElement("edit-repo-auto-launch-toggle", existsIn: app, timeout: 5)
        assertElement("edit-repo-auto-review-toggle", existsIn: app)
        revealElement("edit-repo-webhook-health-button", in: app)
        tapElement("edit-repo-webhook-health-button", in: app)
        XCTAssertTrue(app.staticTexts["Webhook not verified"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.staticTexts["Latest delivery"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "issues labeled")).firstMatch.waitForExistence(timeout: 5), app.debugDescription)
        assertElement("edit-repo-webhook-activity", existsIn: app, timeout: 5)
        XCTAssertTrue(app.staticTexts["Recent activity"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "mock-delivery")).firstMatch.waitForExistence(timeout: 5), app.debugDescription)

        revealElement("edit-repo-recreate-labels-button", in: app)
        tapElement("edit-repo-recreate-labels-button", in: app)
        XCTAssertEqual(server.lastRepoLabelsAction, "recreate")

        revealElement("edit-repo-webhook-configure-button", in: app)
        tapElement("edit-repo-webhook-configure-button", in: app)
        XCTAssertEqual(server.lastWebhookAction, "rotate")
    }

    @MainActor
    func testDisablingAutomationWarnsWhenWebhookSessionIsActive() {
        server.seedPullRequestDeployment()
        let app = launchApp(server: server)

        openSettingsFromToday(in: app)
        openAlphaRepoEditor(in: app)
        assertElement("edit-repo-auto-review-toggle", existsIn: app, timeout: 5)
        let autoReviewSwitch = app.switches["edit-repo-auto-review-toggle"]
        if autoReviewSwitch.exists {
            autoReviewSwitch.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        } else {
            element("edit-repo-auto-review-toggle", in: app).tap()
        }

        let saveButton = app.buttons["edit-repo-save-button"]
        XCTAssertTrue(saveButton.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(saveButton.isEnabled, "Save should be enabled after disabling PR automation\n\(app.debugDescription)")
        saveButton.tap()

        XCTAssertTrue(app.buttons["Save Changes"].waitForExistence(timeout: 5), app.debugDescription)
    }

    @MainActor
    func testSettingsOpensOfflineQueue() {
        let app = launchApp(server: server)

        openSettingsFromToday(in: app)
        app.buttons["settings-offline-queue-link"].tap()

        XCTAssertTrue(app.navigationBars["Offline Queue"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.staticTexts["Queue Empty"].waitForExistence(timeout: 5), app.debugDescription)
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

    @MainActor
    private func openAlphaRepoEditor(in app: XCUIApplication) {
        let repoText = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "org/alpha")).firstMatch
        XCTAssertTrue(repoText.waitForExistence(timeout: 5), "Repo row missing\n\(app.debugDescription)")
        repoText.tap()
    }

    @MainActor
    private func revealElement(_ identifier: String, in app: XCUIApplication) {
        for _ in 0..<4 where !element(identifier, in: app).exists {
            app.swipeUp()
        }
        assertElement(identifier, existsIn: app, timeout: 5)
    }
}
