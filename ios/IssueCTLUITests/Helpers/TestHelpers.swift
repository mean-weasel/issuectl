import XCTest

@MainActor
func launchApp(server: MockIssueCTLServer) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchEnvironment["ISSUECTL_SERVER_URL"] = server.baseURL.absoluteString
    app.launchEnvironment["ISSUECTL_API_TOKEN"] = "ui-test-token"
    app.launchEnvironment["ISSUECTL_UI_TESTING"] = "1"
    app.terminate()
    app.launch()
    dismissRestoredModal(in: app)
    return app
}

@MainActor
func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
    app.descendants(matching: .any)[identifier]
}

@MainActor
func tapElement(
    _ identifier: String,
    in app: XCUIApplication,
    timeout: TimeInterval = 8,
    file: StaticString = #filePath,
    line: UInt = #line
) {
    assertElement(identifier, existsIn: app, timeout: timeout, file: file, line: line)
    element(identifier, in: app).tap()
}

@MainActor
func assertElement(
    _ identifier: String,
    existsIn app: XCUIApplication,
    timeout: TimeInterval = 1,
    file: StaticString = #filePath,
    line: UInt = #line
) {
    let target = element(identifier, in: app)
    let exists = timeout > 0 ? target.waitForExistence(timeout: timeout) : target.exists
    XCTAssertTrue(exists, "Missing \(identifier)\n\(app.debugDescription)", file: file, line: line)
}

@MainActor
func waitForNonexistence(
    _ identifier: String,
    in app: XCUIApplication,
    timeout: TimeInterval = 8,
    file: StaticString = #filePath,
    line: UInt = #line
) {
    let predicate = NSPredicate(format: "exists == false")
    let expectation = XCTNSPredicateExpectation(predicate: predicate, object: element(identifier, in: app))
    let result = XCTWaiter.wait(for: [expectation], timeout: timeout)
    XCTAssertEqual(result, .completed, "\(identifier) did not disappear\n\(app.debugDescription)", file: file, line: line)
}

@MainActor
func waitForButtonNonexistence(
    _ identifier: String,
    in app: XCUIApplication,
    timeout: TimeInterval = 8,
    file: StaticString = #filePath,
    line: UInt = #line
) {
    let predicate = NSPredicate(format: "exists == false")
    let expectation = XCTNSPredicateExpectation(predicate: predicate, object: app.buttons[identifier])
    let result = XCTWaiter.wait(for: [expectation], timeout: timeout)
    XCTAssertEqual(result, .completed, "\(identifier) button did not disappear\n\(app.debugDescription)", file: file, line: line)
}

@MainActor
func openIssuesSection(in app: XCUIApplication) {
    dismissRestoredModal(in: app)
    tapElement("issues-tab", in: app, timeout: 20)
    let openSection = element("section-tab-open", in: app)
    if !openSection.waitForExistence(timeout: 20), app.scrollViews.firstMatch.exists {
        app.scrollViews.firstMatch.swipeRight()
    }
    XCTAssertTrue(openSection.waitForExistence(timeout: 20), "Missing section-tab-open\n\(app.debugDescription)")
    openSection.tap()
}

@MainActor
func dismissRestoredModal(in app: XCUIApplication) {
    if app.buttons["terminal-done-button"].waitForExistence(timeout: 1) {
        app.buttons["terminal-done-button"].tap()
    }
    if app.buttons["launch-cancel-button"].waitForExistence(timeout: 1) {
        app.buttons["launch-cancel-button"].tap()
    }
    if app.buttons["settings-done-button"].waitForExistence(timeout: 1) {
        app.buttons["settings-done-button"].tap()
    }
}
