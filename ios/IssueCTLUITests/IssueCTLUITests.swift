import Network
import XCTest

final class IssueCTLUITests: XCTestCase {
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
    func testCommandCenterActionsAreReachableFromTabs() {
        let app = launchApp()

        assertElement("today-create-issue-button", existsIn: app, timeout: 8)
        assertElement("today-metric-sessions", existsIn: app, timeout: 5)
        assertElement("today-metric-prs", existsIn: app, timeout: 5)
        assertElement("today-metric-issues", existsIn: app, timeout: 5)

        element("today-settings-button", in: app).tap()
        assertElement("settings-done-button", existsIn: app, timeout: 3)
        app.buttons["settings-done-button"].tap()
        waitForButtonNonexistence("settings-done-button", in: app)

        element("today-search-button", in: app).tap()
        assertElement("today-search-field", existsIn: app, timeout: 3)
        assertElement("today-search-issue-101", existsIn: app)
        assertElement("today-search-pr-7", existsIn: app)
        app.buttons["today-search-cancel-button"].tap()
        waitForNonexistence("today-search-field", in: app)

        element("today-create-issue-button", in: app).tap()
        assertElement("issue-title-field", existsIn: app, timeout: 3)
        app.buttons["cancel-button"].tap()
        waitForNonexistence("issue-title-field", in: app)
    }

    @MainActor
    func testListToolbarActionsAreReachableFromTabs() {
        let app = launchApp()

        tapElement("issues-tab", in: app)
        assertElement("issues-create-issue-button", existsIn: app, timeout: 5)
        assertElement("issues-search-button", existsIn: app)
        assertElement("issues-filter-button", existsIn: app)

        tapElement("prs-tab", in: app)
        assertElement("prs-create-issue-button", existsIn: app, timeout: 5)
        assertElement("prs-search-button", existsIn: app)
        assertElement("prs-quick-actions-button", existsIn: app, timeout: 5)
        assertElement("prs-filter-button", existsIn: app)

        tapElement("active-tab", in: app)
        assertElement("sessions-create-issue-button", existsIn: app, timeout: 5)
        assertElement("sessions-search-button", existsIn: app)
        assertElement("sessions-refresh-button", existsIn: app)
    }

    @MainActor
    func testCreateMinimalDraftIssueFromThumbReachEntryPoint() {
        let draftTitle = "CI draft"
        let app = launchApp()

        assertElement("today-create-issue-button", existsIn: app, timeout: 8)
        element("today-create-issue-button", in: app).tap()

        createLocalDraft(title: draftTitle, body: nil, priority: nil, in: app)

        openDraftsSection(in: app)
        assertElement("draft-row-draft-ui-1", existsIn: app, timeout: 8)
        XCTAssertEqual(element("draft-row-draft-ui-1-title", in: app).label, draftTitle)
        openIssuesSection(in: app)
    }

    @MainActor
    func testCreateDetailedDraftIssueFromThumbReachEntryPoint() {
        let draftTitle = "Test draft issue from automation"
        let app = launchApp()

        assertElement("today-create-issue-button", existsIn: app, timeout: 8)
        element("today-create-issue-button", in: app).tap()

        createLocalDraft(
            title: draftTitle,
            body: "This is a test draft created via workflow automation.",
            priority: "High",
            in: app
        )

        openDraftsSection(in: app)
        assertElement("draft-row-draft-ui-1", existsIn: app, timeout: 8)
        XCTAssertEqual(element("draft-row-draft-ui-1-title", in: app).label, draftTitle)
        openIssuesSection(in: app)
    }

    @MainActor
    private func createLocalDraft(
        title: String,
        body: String?,
        priority: String?,
        in app: XCUIApplication
    ) {
        assertElement("issue-title-field", existsIn: app, timeout: 3)
        element("quick-create-repo-more-button", in: app).tap()
        let localDraftButton = app.buttons["quick-create-local-draft-button"]
        if localDraftButton.waitForExistence(timeout: 3) {
            localDraftButton.tap()
        } else {
            app.buttons["quick-create-local-draft-option"].tap()
        }

        element("issue-title-field", in: app).tap()
        app.typeText(title)

        if let body {
            element("issue-body-editor", in: app).tap()
            app.typeText(body)
        }

        if let priority {
            element("quick-create-more-options", in: app).tap()
            app.buttons[priority].tap()
        }

        element("submit-issue-button", in: app).tap()
        waitForNonexistence("issue-title-field", in: app)
    }

    @MainActor
    private func openDraftsSection(in app: XCUIApplication) {
        tapElement("issues-tab", in: app)
        assertElement("section-tab-drafts", existsIn: app, timeout: 8)
        element("section-tab-drafts", in: app).tap()
    }

    @MainActor
    func testTodayActiveSessionsThumbButtonOpensSessions() {
        server.seedActiveDeployment()
        let app = launchApp()

        assertElement("today-active-sessions-button", existsIn: app, timeout: 8)
        element("today-active-sessions-button", in: app).tap()

        assertElement("sessions-command-header", existsIn: app, timeout: 5)
        assertElement("session-reenter-terminal-9001", existsIn: app)
    }

    @MainActor
    func testLaunchingIssueCanBeReenteredFromActiveSessions() {
        let app = launchApp()

        openIssuesSection(in: app)
        assertElement("issue-row-101", existsIn: app, timeout: 8)
        element("issue-row-101", in: app).tap()

        assertElement("issue-detail-launch-button", existsIn: app, timeout: 5)
        element("issue-detail-launch-button", in: app).tap()

        assertElement("launch-recommended-button", existsIn: app, timeout: 5)
        element("launch-recommended-button", in: app).tap()

        XCTAssertTrue(app.buttons["terminal-done-button"].waitForExistence(timeout: 8), app.debugDescription)
        app.buttons["terminal-done-button"].tap()
        assertElement("issue-detail-reenter-terminal-button", existsIn: app, timeout: 5)

        tapElement("active-tab", in: app)
        assertElement("sessions-command-header", existsIn: app, timeout: 5)
        assertElement("session-reenter-terminal-9001", existsIn: app, timeout: 5)
        element("session-reenter-terminal-9001", in: app).tap()

        XCTAssertTrue(app.buttons["terminal-done-button"].waitForExistence(timeout: 5), app.debugDescription)
        app.buttons["terminal-done-button"].tap()
    }

    @MainActor
    func testMultipleLaunchedIssueSessionsRemainAvailableFromActiveSessions() {
        let app = launchApp()

        openIssuesSection(in: app)
        launchIssueSession(101, in: app)
        backToIssueList(in: app, expectingIssue: 102)

        launchIssueSession(102, in: app)

        tapElement("active-tab", in: app)
        assertElement("sessions-command-header", existsIn: app, timeout: 5)
        assertElement("session-reenter-terminal-9001", existsIn: app, timeout: 5)
        assertElement("session-reenter-terminal-9002", existsIn: app, timeout: 5)
        XCTAssertTrue(element("session-reenter-terminal-9001", in: app).isEnabled)
        XCTAssertTrue(element("session-reenter-terminal-9002", in: app).isEnabled)
    }

    @MainActor
    func testRunningIssueDetailShowsReentryInsteadOfLaunch() {
        server.seedActiveDeployment()
        let app = launchApp()

        openIssuesSection(in: app)
        let runningSegment = app.buttons.containing(NSPredicate(format: "label == %@", "Running, 1")).firstMatch
        XCTAssertTrue(runningSegment.waitForExistence(timeout: 5), app.debugDescription)
        runningSegment.tap()
        assertElement("issue-row-101", existsIn: app, timeout: 8)
        element("issue-row-101", in: app).tap()

        assertElement("issue-detail-reenter-terminal-button", existsIn: app, timeout: 5)
        XCTAssertFalse(element("issue-detail-launch-button", in: app).exists, app.debugDescription)

        element("issue-detail-reenter-terminal-button", in: app).tap()
        XCTAssertTrue(app.buttons["terminal-done-button"].waitForExistence(timeout: 5), app.debugDescription)
    }

    @MainActor
    func testUserProfileFailureDoesNotBlockPrimaryLists() {
        server.failUserProfile = true
        let app = launchApp()

        openIssuesSection(in: app)
        assertElement("issue-row-101", existsIn: app, timeout: 8)
        XCTAssertFalse(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "user profile")).firstMatch.exists)

        tapElement("prs-tab", in: app)
        assertElement("pr-row-7", existsIn: app, timeout: 8)
        XCTAssertFalse(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "user profile")).firstMatch.exists)
    }

    @MainActor
    private func launchApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchEnvironment["ISSUECTL_SERVER_URL"] = server.baseURL.absoluteString
        app.launchEnvironment["ISSUECTL_API_TOKEN"] = "ui-test-token"
        app.launchEnvironment["ISSUECTL_UI_TESTING"] = "1"
        app.terminate()
        app.launch()
        return app
    }

    @MainActor
    private func launchIssueSession(_ number: Int, in app: XCUIApplication) {
        assertElement("issue-row-\(number)", existsIn: app, timeout: 8)
        element("issue-row-\(number)", in: app).tap()

        assertElement("issue-detail-launch-button", existsIn: app, timeout: 5)
        element("issue-detail-launch-button", in: app).tap()

        assertElement("launch-recommended-button", existsIn: app, timeout: 5)
        element("launch-recommended-button", in: app).tap()

        XCTAssertTrue(app.buttons["terminal-done-button"].waitForExistence(timeout: 8), app.debugDescription)
        app.buttons["terminal-done-button"].tap()
        assertElement("issue-detail-reenter-terminal-button", existsIn: app, timeout: 5)
    }

    @MainActor
    private func openIssuesSection(in app: XCUIApplication) {
        tapElement("issues-tab", in: app, timeout: 20)

        let openSection = element("section-tab-open", in: app)
        if !openSection.waitForExistence(timeout: 20), app.scrollViews.firstMatch.exists {
            app.scrollViews.firstMatch.swipeRight()
        }

        XCTAssertTrue(openSection.waitForExistence(timeout: 20), "Missing section-tab-open\n\(app.debugDescription)")
        openSection.tap()
    }

    @MainActor
    private func backToIssueList(in app: XCUIApplication, expectingIssue number: Int) {
        if !element("issue-row-\(number)", in: app).exists {
            app.navigationBars.buttons.firstMatch.tap()
        }
        assertElement("issue-row-\(number)", existsIn: app, timeout: 5)
    }

    @MainActor
    private func openSessionTerminal(_ deploymentId: Int, in app: XCUIApplication) {
        let identifier = "session-reenter-terminal-\(deploymentId)"
        let target = element(identifier, in: app)
        XCTAssertTrue(target.waitForExistence(timeout: 5), "Missing \(identifier)\n\(app.debugDescription)")

        if !target.isHittable, app.scrollViews.firstMatch.exists {
            app.scrollViews.firstMatch.swipeUp()
        }

        XCTAssertTrue(target.waitForExistence(timeout: 5), "Missing \(identifier) after scroll\n\(app.debugDescription)")
        XCTAssertTrue(target.isHittable, "\(identifier) is not hittable\n\(app.debugDescription)")
        target.tap()
    }

    @MainActor
    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }

    @MainActor
    private func tapElement(
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
    private func assertElement(
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
    private func waitForNonexistence(
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
    private func waitForButtonNonexistence(
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

}

private final class MockIssueCTLServer: @unchecked Sendable {
    let baseURL: URL
    private let listener: NWListener
    private let queue = DispatchQueue(label: "MockIssueCTLServer")
    private var activeDeployments: [[String: Any]] = []
    private var drafts: [[String: Any]] = []
    var failUserProfile = false

    init() throws {
        let port = NWEndpoint.Port(rawValue: UInt16.random(in: 49_152...65_000))!
        listener = try NWListener(using: .tcp, on: port)
        baseURL = URL(string: "http://127.0.0.1:\(port.rawValue)")!
    }

    func start() throws {
        let ready = XCTestExpectation(description: "mock server started")
        let failure = FailureBox()
        listener.stateUpdateHandler = { state in
            switch state {
            case .ready:
                ready.fulfill()
            case .failed(let error):
                failure.error = error
                ready.fulfill()
            default:
                break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            self?.handle(connection)
        }
        listener.start(queue: queue)

        let result = XCTWaiter.wait(for: [ready], timeout: 2)
        if result != .completed {
            throw NSError(domain: "MockIssueCTLServer", code: 2)
        }
        if let failedError = failure.error {
            throw failedError
        }
    }

    func stop() {
        listener.cancel()
    }

    func seedActiveDeployment() {
        activeDeployments = [deployment]
    }

    private func handle(_ connection: NWConnection) {
        connection.start(queue: queue)
        receiveRequest(on: connection, buffer: Data())
    }

    private func receiveRequest(on connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, _ in
            guard let self else {
                connection.cancel()
                return
            }

            var nextBuffer = buffer
            if let data {
                nextBuffer.append(data)
            }

            if self.hasCompleteHTTPRequest(nextBuffer) || isComplete {
                guard let request = String(data: nextBuffer, encoding: .utf8) else {
                    connection.cancel()
                    return
                }
                let response = self.response(for: request)
                connection.send(content: response, completion: .contentProcessed { _ in
                    connection.cancel()
                })
                return
            }

            self.receiveRequest(on: connection, buffer: nextBuffer)
        }
    }

    private func hasCompleteHTTPRequest(_ data: Data) -> Bool {
        guard let request = String(data: data, encoding: .utf8) else { return false }
        guard let headerRange = request.range(of: "\r\n\r\n") else { return false }
        let headers = String(request[..<headerRange.lowerBound])
        let contentLength = headers
            .components(separatedBy: "\r\n")
            .first { $0.lowercased().hasPrefix("content-length:") }
            .flatMap { line -> Int? in
                let value = line.split(separator: ":", maxSplits: 1).dropFirst().first?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                return value.flatMap(Int.init)
            } ?? 0
        let bodyStart = request.distance(from: request.startIndex, to: headerRange.upperBound)
        return data.count >= bodyStart + contentLength
    }

    private func response(for request: String) -> Data {
        let firstLine = request.split(separator: "\r\n", maxSplits: 1).first ?? ""
        let parts = firstLine.split(separator: " ")
        let method = parts.indices.contains(0) ? String(parts[0]) : "GET"
        let rawPath = parts.indices.contains(1) ? String(parts[1]) : "/"
        let path = rawPath.split(separator: "?", maxSplits: 1).first.map(String.init) ?? rawPath

        let body: Any
        switch (method, path) {
        case ("GET", "/api/v1/health"):
            body = ["ok": true, "version": "ui-test", "timestamp": isoDate]
        case ("GET", "/api/v1/user"):
            if failUserProfile {
                return http(status: 500, json: ["error": "user profile unavailable"])
            }
            body = ["login": "alice"]
        case ("GET", "/api/v1/repos"):
            body = ["repos": [repo]]
        case ("GET", "/api/v1/deployments"):
            body = ["deployments": activeDeployments]
        case ("GET", "/api/v1/drafts"):
            body = ["drafts": drafts]
        case ("GET", "/api/v1/issues/org/alpha"):
            body = ["issues": [issue(number: 101), issue(number: 102)], "from_cache": false, "cached_at": NSNull()]
        case ("GET", "/api/v1/issues/org/alpha/101"):
            body = [
                "issue": issue(number: 101),
                "comments": [],
                "deployments": deployments(for: 101),
                "linkedPRs": [],
                "referencedFiles": [],
                "fromCache": false,
            ]
        case ("GET", "/api/v1/issues/org/alpha/102"):
            body = [
                "issue": issue(number: 102),
                "comments": [],
                "deployments": deployments(for: 102),
                "linkedPRs": [],
                "referencedFiles": [],
                "fromCache": false,
            ]
        case ("GET", "/api/v1/issues/org/alpha/priorities"):
            body = ["priorities": [
                ["repo_id": 1, "issue_number": 101, "priority": "high", "updated_at": 1_777_440_000],
                ["repo_id": 1, "issue_number": 102, "priority": "normal", "updated_at": 1_777_440_000],
            ]]
        case ("GET", "/api/v1/issues/org/alpha/101/priority"):
            body = ["priority": "high"]
        case ("GET", "/api/v1/issues/org/alpha/102/priority"):
            body = ["priority": "normal"]
        case ("GET", "/api/v1/pulls/org/alpha"):
            body = ["pulls": pulls, "from_cache": false, "cached_at": NSNull()]
        case ("POST", "/api/v1/launch/org/alpha/101"):
            activateDeployment(issueNumber: 101)
            body = ["success": true, "deployment_id": 9001, "ttyd_port": 19001, "error": NSNull(), "label_warning": NSNull()]
        case ("POST", "/api/v1/launch/org/alpha/102"):
            activateDeployment(issueNumber: 102)
            body = ["success": true, "deployment_id": 9002, "ttyd_port": 19002, "error": NSNull(), "label_warning": NSNull()]
        case ("POST", "/api/v1/drafts"):
            createDraft(from: request)
            body = ["success": true, "id": "draft-ui-1", "error": NSNull()]
        case ("POST", "/api/v1/drafts/draft-ui-1/assign"):
            body = [
                "success": true,
                "issue_number": 202,
                "issue_url": "https://github.com/org/alpha/issues/202",
                "cleanup_warning": NSNull(),
                "labels_warning": NSNull(),
                "error": NSNull(),
            ]
        default:
            return http(status: 404, json: ["error": "Unhandled \(method) \(path)"])
        }

        return http(status: 200, json: body)
    }

    private func http(status: Int, json: Any) -> Data {
        let data = try! JSONSerialization.data(withJSONObject: json)
        let reason = status == 200 ? "OK" : "Not Found"
        let header = """
        HTTP/1.1 \(status) \(reason)\r
        Content-Type: application/json\r
        Content-Length: \(data.count)\r
        Connection: close\r
        \r

        """
        return Data(header.utf8) + data
    }

    private var isoDate: String { "2026-04-29T08:00:00Z" }

    private var repo: [String: Any] {
        [
            "id": 1,
            "owner": "org",
            "name": "alpha",
            "local_path": "/tmp/alpha",
            "branch_pattern": NSNull(),
            "created_at": isoDate,
        ]
    }

    private func issue(number: Int) -> [String: Any] {
        return [
            "number": number,
            "title": number == 101 ? "Improve launch handoff" : "Persist multiple sessions",
            "body": number == 101
                ? "Keep the terminal reachable after leaving detail."
                : "Keep independent terminals reachable after launching more than one issue.",
            "state": "open",
            "labels": [["name": "bug", "color": "d73a4a", "description": NSNull()]],
            "assignees": [["login": "alice", "avatar_url": ""]],
            "user": ["login": "alice", "avatar_url": ""],
            "comment_count": 0,
            "created_at": isoDate,
            "updated_at": isoDate,
            "closed_at": NSNull(),
            "html_url": "https://github.com/org/alpha/issues/\(number)",
        ]
    }

    private func createDraft(from request: String) {
        let payload = jsonBody(from: request)
        drafts = [
            [
                "id": "draft-ui-1",
                "title": payload["title"] as? String ?? "Untitled draft",
                "body": payload["body"] as? String ?? NSNull(),
                "priority": payload["priority"] as? String ?? "normal",
                "created_at": 1_777_440_000,
            ]
        ]
    }

    private func jsonBody(from request: String) -> [String: Any] {
        guard
            let body = request.components(separatedBy: "\r\n\r\n").last,
            let data = body.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            return [:]
        }
        return json
    }

    private var pulls: [[String: Any]] {
        [
            pull(number: 7, title: "Pending review work", checksStatus: "pending"),
            pull(number: 8, title: "Passing background work", checksStatus: "success"),
        ]
    }

    private func pull(number: Int, title: String, checksStatus: String) -> [String: Any] {
        return [
            "number": number,
            "title": title,
            "body": NSNull(),
            "state": "open",
            "draft": false,
            "merged": false,
            "user": ["login": "alice", "avatar_url": ""],
            "head_ref": "feature-\(number)",
            "base_ref": "main",
            "additions": 3,
            "deletions": 1,
            "changed_files": 2,
            "created_at": isoDate,
            "updated_at": isoDate,
            "merged_at": NSNull(),
            "closed_at": NSNull(),
            "html_url": "https://github.com/org/alpha/pull/\(number)",
            "checks_status": checksStatus,
        ]
    }

    private var deployment: [String: Any] {
        deployment(issueNumber: 101)
    }

    private func deployment(issueNumber: Int) -> [String: Any] {
        let id = issueNumber == 101 ? 9001 : 9002
        return [
            "id": id,
            "repo_id": 1,
            "issue_number": issueNumber,
            "branch_name": issueNumber == 101
                ? "issue-101-improve-launch-handoff"
                : "issue-102-persist-multiple-sessions",
            "workspace_mode": "worktree",
            "workspace_path": "/tmp/alpha-worktree-\(issueNumber)",
            "linked_pr_number": NSNull(),
            "state": "active",
            "launched_at": isoDate,
            "ended_at": NSNull(),
            "ttyd_port": issueNumber == 101 ? 19001 : 19002,
            "ttyd_pid": issueNumber == 101 ? 12345 : 12346,
            "owner": "org",
            "repo_name": "alpha",
        ]
    }

    private func activateDeployment(issueNumber: Int) {
        activeDeployments.removeAll { $0["issue_number"] as? Int == issueNumber }
        activeDeployments.append(deployment(issueNumber: issueNumber))
    }

    private func deployments(for issueNumber: Int) -> [[String: Any]] {
        activeDeployments.filter { $0["issue_number"] as? Int == issueNumber }
    }
}

private final class FailureBox: @unchecked Sendable {
    var error: NWError?
}
