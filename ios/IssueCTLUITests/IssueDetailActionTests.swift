// ios/IssueCTLUITests/IssueDetailActionTests.swift
import XCTest

final class IssueDetailActionTests: XCTestCase {
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
    func testCloseIssueFromDetailActionsMenu() {
        let app = launchApp(server: server)

        openIssuesSection(in: app)
        assertElement("issue-row-101", existsIn: app, timeout: 8)
        element("issue-row-101", in: app).tap()

        // Open the actions menu and tap Close Issue.
        assertElement("issue-detail-actions-menu", existsIn: app, timeout: 5)
        element("issue-detail-actions-menu", in: app).tap()

        let closeButton = app.buttons["Close Issue"]
        XCTAssertTrue(closeButton.waitForExistence(timeout: 3), "Close Issue menu item missing")
        closeButton.tap()

        // Confirmation dialog appears — tap Close.
        let confirmButton = app.buttons["Close"]
        XCTAssertTrue(confirmButton.waitForExistence(timeout: 3), "Close confirmation missing")
        confirmButton.tap()

        // Issue should now show the Reopen button instead of Launch.
        assertElement("issue-detail-reopen-button", existsIn: app, timeout: 5)
    }

    @MainActor
    func testAddCommentToIssueFromActionsMenu() {
        let app = launchApp(server: server)

        openIssuesSection(in: app)
        assertElement("issue-row-101", existsIn: app, timeout: 8)
        element("issue-row-101", in: app).tap()

        // Open the actions menu and tap Comment.
        assertElement("issue-detail-actions-menu", existsIn: app, timeout: 5)
        element("issue-detail-actions-menu", in: app).tap()

        let commentButton = app.buttons["Comment"]
        XCTAssertTrue(commentButton.waitForExistence(timeout: 3), "Comment menu item missing")
        commentButton.tap()

        // The comment sheet should appear with a text editor.
        // Type a comment and submit.
        let textEditor = app.textViews.firstMatch
        XCTAssertTrue(textEditor.waitForExistence(timeout: 3), "Comment text editor missing")
        textEditor.tap()
        app.typeText("Test comment from automation")

        // Tap the "Add Comment" submit button.
        let submitButton = app.buttons["Add Comment"]
        XCTAssertTrue(submitButton.waitForExistence(timeout: 3), "Submit comment button missing")
        submitButton.tap()

        // Sheet should dismiss — wait for actions menu to reappear.
        assertElement("issue-detail-actions-menu", existsIn: app, timeout: 8)
    }

    @MainActor
    func testReopenClosedIssueFromDetail() {
        server.seedClosedIssue(101)
        let app = launchApp(server: server)

        openIssuesSection(in: app)

        // Navigate to Closed section tab.
        // The section tabs sit in a horizontal ScrollView; the Closed tab (last of 5)
        // may be off-screen. Swipe left on the Open tab to scroll the row, then tap.
        let openTab = element("section-tab-open", in: app)
        XCTAssertTrue(openTab.waitForExistence(timeout: 8), app.debugDescription)
        openTab.swipeLeft()

        let closedTab = element("section-tab-closed", in: app)
        XCTAssertTrue(closedTab.waitForExistence(timeout: 5), app.debugDescription)
        closedTab.tap()

        assertElement("issue-row-101", existsIn: app, timeout: 8)
        element("issue-row-101", in: app).tap()

        // Tap the Reopen button.
        assertElement("issue-detail-reopen-button", existsIn: app, timeout: 5)
        element("issue-detail-reopen-button", in: app).tap()

        // Confirmation dialog — tap Reopen (firstMatch disambiguates from any list swipe buttons).
        let confirmButton = app.buttons["Reopen"].firstMatch
        XCTAssertTrue(confirmButton.waitForExistence(timeout: 3), "Reopen confirmation missing")
        confirmButton.tap()

        // After reopen, the Launch button should appear.
        assertElement("issue-detail-launch-button", existsIn: app, timeout: 5)
    }
}
