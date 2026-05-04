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
        let actionsMenu = app.buttons["issue-detail-actions-menu"]
        XCTAssertTrue(actionsMenu.waitForExistence(timeout: 5), "Issue actions menu missing\n\(app.debugDescription)")
        actionsMenu.tap()

        let closeButton = app.buttons["Close Issue"]
        XCTAssertTrue(closeButton.waitForExistence(timeout: 3), "Close Issue menu item missing")
        closeButton.tap()

        // Confirmation dialog appears — tap Close.
        let confirmButton = app.buttons["Close"]
        XCTAssertTrue(confirmButton.waitForExistence(timeout: 3), "Close confirmation missing")
        confirmButton.tap()

        // Issue should now show the Reopen button instead of Launch.
        XCTAssertTrue(app.buttons["Reopen"].firstMatch.waitForExistence(timeout: 5), app.debugDescription)
    }

    @MainActor
    func testAddCommentToIssueFromActionsMenu() {
        let app = launchApp(server: server)

        openIssuesSection(in: app)
        assertElement("issue-row-101", existsIn: app, timeout: 8)
        element("issue-row-101", in: app).tap()

        submitIssueComment("Test comment from automation", in: app)

        // Sheet should dismiss — wait for actions menu to reappear.
        assertElement("issue-detail-actions-menu", existsIn: app, timeout: 8)
    }

    @MainActor
    func testOfflineIssueCommentQueuesAndManualSyncClearsBanner() {
        server.dropIssueCommentRequests = true
        let queuedComment = "Queued offline comment from automation"
        let app = launchApp(server: server)

        openIssuesSection(in: app)
        assertElement("issue-row-101", existsIn: app, timeout: 8)
        element("issue-row-101", in: app).tap()

        submitIssueComment(queuedComment, in: app)

        assertOfflineQueueLabel(containing: "Offline action pending", in: app)
        assertOfflineQueueLabel(containing: "1 pending", in: app)

        server.dropIssueCommentRequests = false
        let syncButton = app.buttons["Sync offline actions"].firstMatch
        XCTAssertTrue(syncButton.waitForExistence(timeout: 5), "Sync offline actions button missing\n\(app.debugDescription)")
        syncButton.tap()

        waitForOfflineQueueToClear(in: app)
        XCTAssertTrue(
            server.commentBodies(for: 101).contains(queuedComment),
            "Expected queued comment to replay to the mock server"
        )
    }

    @MainActor
    func testOfflineIssueCloseQueuesAndManualSyncClosesIssue() {
        server.dropIssueStateRequests = true
        let app = launchApp(server: server)

        openIssuesSection(in: app)
        assertElement("issue-row-101", existsIn: app, timeout: 8)
        element("issue-row-101", in: app).tap()

        closeIssueWithoutComment(in: app)

        // Limitation: this currently exposes whether issue-state failures are queued by the app.
        // If the app shows its generic network error alert here, app-side issue-state queueing is not wired up yet.
        assertOfflineQueueLabel(containing: "Offline action pending", in: app)
        assertOfflineQueueLabel(containing: "1 pending", in: app)
        XCTAssertEqual(server.issueState(for: 101), "open", "Dropped state request should not mutate mock server state")

        server.dropIssueStateRequests = false
        let syncButton = app.buttons["Sync offline actions"].firstMatch
        XCTAssertTrue(syncButton.waitForExistence(timeout: 5), "Sync offline actions button missing\n\(app.debugDescription)")
        syncButton.tap()

        waitForOfflineQueueToClear(in: app)
        XCTAssertEqual(server.issueState(for: 101), "closed", "Expected queued close action to replay to the mock server")
    }

    @MainActor
    func testOfflineIssueReopenQueuesAndManualSyncReopensIssue() {
        server.seedClosedIssue(101)
        server.dropIssueStateRequests = true
        let app = launchApp(server: server)

        openIssuesSection(in: app)
        openClosedIssue101(in: app)

        reopenIssue(in: app)

        assertOfflineQueueLabel(containing: "Offline action pending", in: app)
        assertOfflineQueueLabel(containing: "1 pending", in: app)
        XCTAssertEqual(server.issueState(for: 101), "closed", "Dropped reopen request should not mutate mock server state")

        server.dropIssueStateRequests = false
        let syncButton = app.buttons["Sync offline actions"].firstMatch
        XCTAssertTrue(syncButton.waitForExistence(timeout: 5), "Sync offline actions button missing\n\(app.debugDescription)")
        syncButton.tap()

        waitForOfflineQueueToClear(in: app)
        XCTAssertEqual(server.issueState(for: 101), "open", "Expected queued reopen action to replay to the mock server")
    }

    @MainActor
    func testSetIssuePriorityFromActionsMenu() {
        let app = launchApp(server: server)

        openIssuesSection(in: app)
        assertElement("issue-row-101", existsIn: app, timeout: 8)
        element("issue-row-101", in: app).tap()

        // Open the actions menu and look for Priority submenu.
        let actionsMenu = app.buttons["issue-detail-actions-menu"]
        XCTAssertTrue(actionsMenu.waitForExistence(timeout: 5), "Issue actions menu missing\n\(app.debugDescription)")
        actionsMenu.tap()

        let priorityButton = app.buttons["Priority"]
        XCTAssertTrue(priorityButton.waitForExistence(timeout: 3), "Priority menu item missing")
        priorityButton.tap()

        // Select "Low" priority.
        let lowButton = app.buttons["Low"]
        XCTAssertTrue(lowButton.waitForExistence(timeout: 3), "Low priority option missing")
        lowButton.tap()

        // The menu should dismiss. Verify we're back on the detail view.
        assertElement("issue-detail-actions-menu", existsIn: app, timeout: 5)
    }

    @MainActor
    func testReopenClosedIssueFromDetail() {
        server.seedClosedIssue(101)
        let app = launchApp(server: server)

        openIssuesSection(in: app)
        openClosedIssue101(in: app)

        reopenIssue(in: app)

        // After reopen, the launch status card should appear.
        assertElement("issue-detail-launch-status-card", existsIn: app, timeout: 5)
        XCTAssertTrue(app.buttons["Launch Agent"].firstMatch.waitForExistence(timeout: 5), app.debugDescription)
    }

    @MainActor
    private func openClosedIssue101(in app: XCUIApplication) {
        let openTab = element("section-tab-open", in: app)
        XCTAssertTrue(openTab.waitForExistence(timeout: 8), app.debugDescription)
        openTab.swipeLeft()

        let closedTab = element("section-tab-closed", in: app)
        XCTAssertTrue(closedTab.waitForExistence(timeout: 5), app.debugDescription)
        closedTab.tap()

        assertElement("issue-row-101", existsIn: app, timeout: 8)
        element("issue-row-101", in: app).tap()
    }

    @MainActor
    private func reopenIssue(in app: XCUIApplication) {
        let reopenButton = app.buttons["Reopen"].firstMatch
        XCTAssertTrue(reopenButton.waitForExistence(timeout: 5), "Reopen button missing\n\(app.debugDescription)")
        reopenButton.tap()

        let confirmButton = app.buttons["Reopen"].firstMatch
        XCTAssertTrue(confirmButton.waitForExistence(timeout: 3), "Reopen confirmation missing")
        confirmButton.tap()
    }

    @MainActor
    private func closeIssueWithoutComment(in app: XCUIApplication) {
        let actionsMenu = app.buttons["issue-detail-actions-menu"]
        XCTAssertTrue(actionsMenu.waitForExistence(timeout: 5), "Issue actions menu missing\n\(app.debugDescription)")
        actionsMenu.tap()

        let closeButton = app.buttons["Close Issue"]
        XCTAssertTrue(closeButton.waitForExistence(timeout: 3), "Close Issue menu item missing")
        closeButton.tap()

        let confirmButton = app.buttons["Close"].firstMatch
        XCTAssertTrue(confirmButton.waitForExistence(timeout: 3), "Close confirmation missing\n\(app.debugDescription)")
        confirmButton.tap()
    }

    @MainActor
    private func submitIssueComment(_ body: String, in app: XCUIApplication) {
        let actionsMenu = app.buttons["issue-detail-actions-menu"]
        XCTAssertTrue(actionsMenu.waitForExistence(timeout: 5), "Issue actions menu missing\n\(app.debugDescription)")
        actionsMenu.tap()

        let commentButton = app.collectionViews.buttons["Comment"].firstMatch
        XCTAssertTrue(commentButton.waitForExistence(timeout: 3), "Comment menu item missing")
        commentButton.tap()

        let textEditor = app.textViews.firstMatch
        XCTAssertTrue(textEditor.waitForExistence(timeout: 3), "Comment text editor missing")
        textEditor.tap()
        app.typeText(body)

        let submitButton = app.buttons["Add Comment"]
        XCTAssertTrue(submitButton.waitForExistence(timeout: 3), "Submit comment button missing")
        submitButton.tap()
    }

    @MainActor
    private func assertOfflineQueueLabel(
        containing text: String,
        in app: XCUIApplication,
        timeout: TimeInterval = 8,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let label = offlineQueueElement(containing: text, in: app)
        XCTAssertTrue(
            label.waitForExistence(timeout: timeout),
            "Missing offline queue label containing \(text)\n\(app.debugDescription)",
            file: file,
            line: line
        )
    }

    @MainActor
    private func waitForOfflineQueueToClear(
        in app: XCUIApplication,
        timeout: TimeInterval = 8,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let label = offlineQueueElement(containing: "Offline action", in: app)
        let predicate = NSPredicate(format: "exists == false")
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: label)
        let result = XCTWaiter.wait(for: [expectation], timeout: timeout)
        XCTAssertEqual(
            result,
            .completed,
            "Offline queue banner did not clear\n\(app.debugDescription)",
            file: file,
            line: line
        )
    }

    @MainActor
    private func offlineQueueElement(containing text: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@", text))
            .firstMatch
    }
}
