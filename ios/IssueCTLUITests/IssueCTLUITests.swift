import Network
import XCTest

@MainActor
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

    func testCommandCenterActionsAreReachableFromTabs() {
        let app = launchApp()

        assertElement("today-create-issue-button", existsIn: app, timeout: 8)
        assertElement("today-metric-sessions", existsIn: app)
        assertElement("today-metric-prs", existsIn: app)
        assertElement("today-metric-issues", existsIn: app)

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

        app.buttons["issues-tab"].tap()
        assertElement("issues-create-issue-button", existsIn: app, timeout: 5)
        assertElement("issues-filter-button", existsIn: app)

        app.buttons["prs-tab"].tap()
        assertElement("prs-quick-actions-button", existsIn: app, timeout: 5)
        assertElement("prs-filter-button", existsIn: app)

        app.buttons["active-tab"].tap()
        assertElement("sessions-create-issue-button", existsIn: app, timeout: 5)
    }

    func testLaunchingIssueCanBeReenteredFromActiveSessions() {
        let app = launchApp()

        app.buttons["issues-tab"].tap()
        assertElement("issue-row-101", existsIn: app, timeout: 8)
        element("issue-row-101", in: app).tap()

        assertElement("issue-detail-launch-button", existsIn: app, timeout: 5)
        element("issue-detail-launch-button", in: app).tap()

        assertElement("launch-recommended-button", existsIn: app, timeout: 5)
        element("launch-recommended-button", in: app).tap()

        XCTAssertTrue(app.buttons["terminal-done-button"].waitForExistence(timeout: 8), app.debugDescription)
        app.buttons["terminal-done-button"].tap()
        assertElement("issue-detail-reenter-terminal-button", existsIn: app, timeout: 5)

        app.buttons["active-tab"].tap()
        assertElement("session-reenter-terminal-9001", existsIn: app, timeout: 5)
        element("session-reenter-terminal-9001", in: app).tap()

        XCTAssertTrue(app.buttons["terminal-done-button"].waitForExistence(timeout: 5), app.debugDescription)
    }

    private func launchApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchEnvironment["ISSUECTL_SERVER_URL"] = server.baseURL.absoluteString
        app.launchEnvironment["ISSUECTL_API_TOKEN"] = "ui-test-token"
        app.launchEnvironment["ISSUECTL_UI_TESTING"] = "1"
        app.launch()
        return app
    }

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }

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

    private func waitForNonexistence(
        _ identifier: String,
        in app: XCUIApplication,
        timeout: TimeInterval = 3,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let predicate = NSPredicate(format: "exists == false")
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: element(identifier, in: app))
        let result = XCTWaiter.wait(for: [expectation], timeout: timeout)
        XCTAssertEqual(result, .completed, "\(identifier) did not disappear\n\(app.debugDescription)", file: file, line: line)
    }
}

private final class MockIssueCTLServer: @unchecked Sendable {
    let baseURL: URL
    private let listener: NWListener
    private let queue = DispatchQueue(label: "MockIssueCTLServer")
    private var activeDeployments: [[String: Any]] = []

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

    private func handle(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, _, _ in
            guard let self, let data, let request = String(data: data, encoding: .utf8) else {
                connection.cancel()
                return
            }
            let response = self.response(for: request)
            connection.send(content: response, completion: .contentProcessed { _ in
                connection.cancel()
            })
        }
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
            body = ["login": "alice"]
        case ("GET", "/api/v1/repos"):
            body = ["repos": [repo]]
        case ("GET", "/api/v1/deployments"):
            body = ["deployments": activeDeployments]
        case ("GET", "/api/v1/issues/org/alpha"):
            body = ["issues": [issue], "from_cache": false, "cached_at": NSNull()]
        case ("GET", "/api/v1/issues/org/alpha/101"):
            body = [
                "issue": issue,
                "comments": [],
                "deployments": activeDeployments,
                "linkedPRs": [],
                "referencedFiles": [],
                "fromCache": false,
            ]
        case ("GET", "/api/v1/issues/org/alpha/priorities"):
            body = ["priorities": [["repo_id": 1, "issue_number": 101, "priority": "high", "updated_at": 1_777_440_000]]]
        case ("GET", "/api/v1/issues/org/alpha/101/priority"):
            body = ["priority": "high"]
        case ("GET", "/api/v1/pulls/org/alpha"):
            body = ["pulls": pulls, "from_cache": false, "cached_at": NSNull()]
        case ("POST", "/api/v1/launch/org/alpha/101"):
            activeDeployments = [deployment]
            body = ["success": true, "deployment_id": 9001, "ttyd_port": 19001, "error": NSNull(), "label_warning": NSNull()]
        case ("POST", "/api/v1/drafts"):
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

    private var issue: [String: Any] {
        [
            "number": 101,
            "title": "Improve launch handoff",
            "body": "Keep the terminal reachable after leaving detail.",
            "state": "open",
            "labels": [["name": "bug", "color": "d73a4a", "description": NSNull()]],
            "assignees": [["login": "alice", "avatar_url": ""]],
            "user": ["login": "alice", "avatar_url": ""],
            "comment_count": 0,
            "created_at": isoDate,
            "updated_at": isoDate,
            "closed_at": NSNull(),
            "html_url": "https://github.com/org/alpha/issues/101",
        ]
    }

    private var pulls: [[String: Any]] {
        [
            pull(number: 7, title: "Pending review work", checksStatus: "pending"),
            pull(number: 8, title: "Passing background work", checksStatus: "success"),
        ]
    }

    private func pull(number: Int, title: String, checksStatus: String) -> [String: Any] {
        [
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
        [
            "id": 9001,
            "repo_id": 1,
            "issue_number": 101,
            "branch_name": "issue-101-improve-launch-handoff",
            "workspace_mode": "worktree",
            "workspace_path": "/tmp/alpha-worktree",
            "linked_pr_number": NSNull(),
            "state": "active",
            "launched_at": isoDate,
            "ended_at": NSNull(),
            "ttyd_port": 19001,
            "ttyd_pid": 12345,
            "owner": "org",
            "repo_name": "alpha",
        ]
    }
}

private final class FailureBox: @unchecked Sendable {
    var error: NWError?
}
