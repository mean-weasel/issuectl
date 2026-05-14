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

    func testStatusMenuOpensSettings() {
        openSettings()

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

    private func openSettings() {
        let statusItem = app.statusItems["IssueCTL"].firstMatch
        XCTAssertTrue(statusItem.waitForExistence(timeout: 8), app.debugDescription)

        statusItem.click()
        let settingsItem = app.menuItems["Settings..."].firstMatch
        XCTAssertTrue(settingsItem.waitForExistence(timeout: 3), app.debugDescription)
        settingsItem.click()
    }
}
