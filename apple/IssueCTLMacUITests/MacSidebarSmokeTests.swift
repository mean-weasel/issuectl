import XCTest

@MainActor
final class MacSidebarSmokeTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false

        app = XCUIApplication()
        app.launchEnvironment["ISSUECTL_UI_TESTING"] = "1"
        app.launchEnvironment["ISSUECTL_SERVER_URL"] = "http://127.0.0.1:9"
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
        let statusItem = app.statusItems["IssueCTL"].firstMatch
        XCTAssertTrue(statusItem.waitForExistence(timeout: 8), app.debugDescription)

        statusItem.click()
        let settingsItem = app.menuItems["Settings..."].firstMatch
        XCTAssertTrue(settingsItem.waitForExistence(timeout: 3), app.debugDescription)
        settingsItem.click()

        let settingsView = app.descendants(matching: .any)["mac-settings-view"]
        XCTAssertTrue(settingsView.waitForExistence(timeout: 5), app.debugDescription)
    }
}
