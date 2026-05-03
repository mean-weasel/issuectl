import Network
import XCTest

final class MockIssueCTLServer: @unchecked Sendable {
    let baseURL: URL
    private let listener: NWListener
    private let queue = DispatchQueue(label: "MockIssueCTLServer")

    // Mutable state seeded before launch and mutated by endpoint handlers.
    private var activeDeployments: [[String: Any]] = []
    private var drafts: [[String: Any]] = []

    // Failure controls for recovery-path UI tests.
    var failUserProfile = false
    var failRepos = false
    var failDeployments = false
    var issueDetailDeploymentsLagBehindLaunch = false

    // Settings controls.
    var defaultLaunchAgent = "claude"

    private let stateLock = NSLock()
    private var lastLaunchPayload: [String: Any] = [:]

    var lastLaunchAgent: String? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return lastLaunchPayload["agent"] as? String
    }

    // Fixture state for extended test coverage.
    var issueStates: [Int: String] = [101: "open", 102: "open"]
    var issueComments: [Int: [[String: Any]]] = [:]
    var issueLabels: [Int: [[String: Any]]] = [
        101: [["name": "bug", "color": "d73a4a", "description": NSNull()]],
        102: [["name": "bug", "color": "d73a4a", "description": NSNull()]],
    ]
    var issuePriorities: [Int: String] = [101: "high", 102: "normal"]
    var repos: [[String: Any]] = []
    var worktrees: [[String: Any]] = []
    private var nextCommentId: Int = 1001

    init() throws {
        var lastError: Error?
        for _ in 0..<5 {
            let port = NWEndpoint.Port(rawValue: UInt16.random(in: 49_152...65_000))!
            do {
                let attempt = try NWListener(using: .tcp, on: port)
                listener = attempt
                baseURL = URL(string: "http://127.0.0.1:\(port.rawValue)")!
                repos = [defaultRepo]
                worktrees = [activeWorktree, staleWorktree]
                return
            } catch {
                lastError = error
            }
        }
        throw lastError ?? NSError(domain: "MockIssueCTLServer", code: 1,
                                   userInfo: [NSLocalizedDescriptionKey: "No available port after 5 attempts"])
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

    // MARK: - Seed Helpers

    func seedActiveDeployment() {
        activeDeployments = [deployment(issueNumber: 101)]
    }

    func seedClosedIssue(_ number: Int) {
        issueStates[number] = "closed"
    }

    func seedComments(for number: Int, comments: [[String: Any]]) {
        issueComments[number] = comments
    }

    func seedSecondRepo() {
        repos = [defaultRepo, betaRepo]
    }

    // MARK: - Connection handling

    private func handle(_ connection: NWConnection) {
        connection.start(queue: queue)
        receiveRequest(on: connection, buffer: Data())
    }

    private func receiveRequest(on connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            if let error {
                print("[MockServer] receive error: \(error)")
                connection.cancel()
                return
            }
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
                connection.send(content: response, completion: .contentProcessed { sendError in
                    if let sendError { print("[MockServer] send error: \(sendError)") }
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

    // MARK: - Router

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

        case ("GET", "/api/v1/settings"):
            body = ["settings": [
                "launch_agent": defaultLaunchAgent,
                "claude_extra_args": "--dangerously-skip-permissions",
                "codex_extra_args": "",
            ]]

        case ("GET", "/api/v1/repos"):
            if failRepos {
                return http(status: 500, json: ["error": "repos unavailable"])
            }
            body = ["repos": repos]

        case ("DELETE", "/api/v1/repos/org/alpha"):
            repos.removeAll { $0["name"] as? String == "alpha" }
            body = ["success": true]

        case ("PATCH", "/api/v1/repos/org/alpha"):
            let payload = jsonBody(from: request)
            if let idx = repos.firstIndex(where: { $0["name"] as? String == "alpha" }) {
                for (key, value) in payload {
                    repos[idx][key] = value
                }
            }
            body = ["success": true]

        case ("GET", "/api/v1/repos/org/alpha/labels"):
            body = ["labels": repoLabels]

        case ("GET", "/api/v1/deployments"):
            if failDeployments {
                return http(status: 500, json: ["error": "deployments unavailable"])
            }
            body = ["deployments": activeDeployments]

        case ("GET", "/api/v1/sessions/previews"):
            body = ["previews": sessionPreviews()]

        case ("POST", "/api/v1/deployments/9001/end"):
            activeDeployments.removeAll { $0["id"] as? Int == 9001 }
            body = ["success": true]

        case ("GET", "/api/v1/drafts"):
            body = ["drafts": drafts]

        case ("PATCH", "/api/v1/drafts/draft-ui-1"):
            let payload = jsonBody(from: request)
            if let idx = drafts.firstIndex(where: { $0["id"] as? String == "draft-ui-1" }) {
                for (key, value) in payload {
                    drafts[idx][key] = value
                }
            }
            body = ["success": true]

        case ("GET", "/api/v1/issues/org/alpha"):
            body = ["issues": [issue(number: 101), issue(number: 102)], "from_cache": false, "cached_at": NSNull()]

        case ("GET", "/api/v1/issues/org/beta"):
            body = ["issues": [], "from_cache": false, "cached_at": NSNull()]

        case ("GET", "/api/v1/issues/org/alpha/101"):
            body = issueDetailBody(101)

        case ("GET", "/api/v1/issues/org/alpha/102"):
            body = issueDetailBody(102)

        case ("POST", "/api/v1/issues/org/alpha/101/state"):
            let payload = jsonBody(from: request)
            if let state = payload["state"] as? String { issueStates[101] = state }
            body = ["success": true, "state": issueStates[101] ?? "open"]

        case ("POST", "/api/v1/issues/org/alpha/102/state"):
            let payload = jsonBody(from: request)
            if let state = payload["state"] as? String { issueStates[102] = state }
            body = ["success": true, "state": issueStates[102] ?? "open"]

        case ("POST", "/api/v1/issues/org/alpha/101/comments"):
            let payload = jsonBody(from: request)
            let commentBody = payload["body"] as? String ?? ""
            let comment = makeComment(id: nextCommentId, body: commentBody)
            nextCommentId += 1
            issueComments[101, default: []].append(comment)
            body = ["success": true, "comment": comment]

        case ("POST", "/api/v1/issues/org/alpha/102/comments"):
            let payload = jsonBody(from: request)
            let commentBody = payload["body"] as? String ?? ""
            let comment = makeComment(id: nextCommentId, body: commentBody)
            nextCommentId += 1
            issueComments[102, default: []].append(comment)
            body = ["success": true, "comment": comment]

        case ("PUT", "/api/v1/issues/org/alpha/101/priority"):
            let payload = jsonBody(from: request)
            if let p = payload["priority"] as? String { issuePriorities[101] = p }
            body = ["success": true, "priority": issuePriorities[101] ?? "normal"]

        case ("PUT", "/api/v1/issues/org/alpha/102/priority"):
            let payload = jsonBody(from: request)
            if let p = payload["priority"] as? String { issuePriorities[102] = p }
            body = ["success": true, "priority": issuePriorities[102] ?? "normal"]

        case ("GET", "/api/v1/issues/org/alpha/priorities"):
            body = ["priorities": [
                ["repo_id": 1, "issue_number": 101, "priority": issuePriorities[101] ?? "normal", "updated_at": 1_777_440_000],
                ["repo_id": 1, "issue_number": 102, "priority": issuePriorities[102] ?? "normal", "updated_at": 1_777_440_000],
            ]]

        case ("GET", "/api/v1/issues/org/alpha/101/priority"):
            body = ["priority": issuePriorities[101] ?? "normal"]

        case ("GET", "/api/v1/issues/org/alpha/102/priority"):
            body = ["priority": issuePriorities[102] ?? "normal"]

        case ("POST", "/api/v1/issues/org/alpha/101/labels"):
            let payload = jsonBody(from: request)
            if let name = payload["name"] as? String {
                var labels = issueLabels[101] ?? []
                if let idx = labels.firstIndex(where: { $0["name"] as? String == name }) {
                    labels.remove(at: idx)
                } else {
                    labels.append(["name": name, "color": "0075ca", "description": NSNull()])
                }
                issueLabels[101] = labels
            }
            body = ["success": true, "labels": issueLabels[101] ?? []]

        case ("GET", "/api/v1/pulls/org/alpha"):
            body = ["pulls": pulls, "from_cache": false, "cached_at": NSNull()]

        case ("GET", "/api/v1/pulls/org/beta"):
            body = ["pulls": [], "from_cache": false, "cached_at": NSNull()]

        case ("GET", "/api/v1/pulls/org/alpha/7"):
            body = pullDetailBody(number: 7, title: "Pending review work", checksStatus: "pending")

        case ("GET", "/api/v1/pulls/org/alpha/8"):
            body = pullDetailBody(number: 8, title: "Passing background work", checksStatus: "success")

        case ("POST", "/api/v1/launch/org/alpha/101"):
            activateDeployment(issueNumber: 101, request: request)
            body = ["success": true, "deployment_id": 9001, "ttyd_port": 19001, "error": NSNull(), "label_warning": NSNull()]

        case ("POST", "/api/v1/launch/org/alpha/102"):
            activateDeployment(issueNumber: 102, request: request)
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

        case ("GET", "/api/v1/worktrees"):
            body = ["worktrees": worktrees]

        case ("POST", "/api/v1/worktrees/cleanup"):
            let payload = jsonBody(from: request)
            if let path = payload["path"] as? String {
                worktrees.removeAll { $0["path"] as? String == path }
                body = ["success": true]
            } else {
                let staleCount = worktrees.filter { ($0["stale"] as? Bool) == true }.count
                worktrees.removeAll { ($0["stale"] as? Bool) == true }
                body = ["success": true, "removed": staleCount, "error": NSNull()]
            }

        default:
            return http(status: 404, json: ["error": "Unhandled \(method) \(path)"])
        }

        return http(status: 200, json: body)
    }

    // MARK: - Response helpers

    func http(status: Int, json: Any) -> Data {
        let data: Data
        do {
            data = try JSONSerialization.data(withJSONObject: json)
        } catch {
            print("[MockServer] JSON serialization failed for status \(status): \(error)")
            let fallback = #"{"error":"MockServer serialization failed"}"#.data(using: .utf8)!
            let header = "HTTP/1.1 500 Internal Server Error\r\nContent-Type: application/json\r\nContent-Length: \(fallback.count)\r\nConnection: close\r\n\r\n"
            return Data(header.utf8) + fallback
        }
        let reason = status == 200 ? "OK" : status == 404 ? "Not Found" : "Error"
        let header = """
        HTTP/1.1 \(status) \(reason)\r
        Content-Type: application/json\r
        Content-Length: \(data.count)\r
        Connection: close\r
        \r

        """
        return Data(header.utf8) + data
    }

    func jsonBody(from request: String) -> [String: Any] {
        guard
            let body = request.components(separatedBy: "\r\n\r\n").last,
            let data = body.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            print("[MockServer] failed to parse JSON body from request")
            return [:]
        }
        return json
    }

    // MARK: - Fixture data

    var isoDate: String { "2026-04-29T08:00:00Z" }

    var defaultRepo: [String: Any] {
        [
            "id": 1,
            "owner": "org",
            "name": "alpha",
            "local_path": "/tmp/alpha",
            "branch_pattern": NSNull(),
            "created_at": isoDate,
        ]
    }

    var betaRepo: [String: Any] {
        [
            "id": 2,
            "owner": "org",
            "name": "beta",
            "local_path": "/tmp/beta",
            "branch_pattern": NSNull(),
            "created_at": isoDate,
        ]
    }

    var activeWorktree: [String: Any] {
        [
            "path": "/tmp/alpha-worktree-101",
            "name": "alpha-worktree-101",
            "repo": "alpha",
            "owner": "org",
            "local_path": "/tmp/alpha",
            "issue_number": 101,
            "stale": false,
        ]
    }

    var staleWorktree: [String: Any] {
        [
            "path": "/tmp/alpha-worktree-stale",
            "name": "alpha-worktree-stale",
            "repo": "alpha",
            "owner": "org",
            "local_path": "/tmp/alpha",
            "issue_number": 102,
            "stale": true,
        ]
    }

    var repoLabels: [[String: Any]] {
        [
            ["name": "bug", "color": "d73a4a", "description": "Something isn't working"],
            ["name": "enhancement", "color": "0075ca", "description": "New feature or request"],
            ["name": "documentation", "color": "0052cc", "description": "Improvements to docs"],
        ]
    }

    func issue(number: Int) -> [String: Any] {
        return [
            "number": number,
            "title": number == 101 ? "Improve launch handoff" : "Persist multiple sessions",
            "body": number == 101
                ? "Keep the terminal reachable after leaving detail."
                : "Keep independent terminals reachable after launching more than one issue.",
            "state": issueStates[number] ?? "open",
            "labels": issueLabels[number] ?? [],
            "assignees": [["login": "alice", "avatar_url": ""]],
            "user": ["login": "alice", "avatar_url": ""],
            "comment_count": issueComments[number]?.count ?? 0,
            "created_at": isoDate,
            "updated_at": isoDate,
            "closed_at": issueStates[number] == "closed" ? isoDate : NSNull(),
            "html_url": "https://github.com/org/alpha/issues/\(number)",
        ]
    }

    func issueDetailBody(_ number: Int) -> [String: Any] {
        return [
            "issue": issue(number: number),
            "comments": issueComments[number] ?? [],
            "deployments": deployments(for: number),
            "linkedPRs": [],
            "referencedFiles": [],
            "fromCache": false,
        ]
    }

    func makeComment(id: Int, body: String) -> [String: Any] {
        return [
            "id": id,
            "body": body,
            "user": ["login": "alice", "avatar_url": ""],
            "created_at": isoDate,
            "updated_at": isoDate,
            "html_url": "https://github.com/org/alpha/issues/101#issuecomment-\(id)",
        ]
    }

    var pulls: [[String: Any]] {
        [
            pull(number: 7, title: "Pending review work", checksStatus: "pending"),
            pull(number: 8, title: "Passing background work", checksStatus: "success"),
        ]
    }

    func pull(number: Int, title: String, checksStatus: String) -> [String: Any] {
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

    func pullDetailBody(number: Int, title: String, checksStatus: String) -> [String: Any] {
        return [
            "pull": pull(number: number, title: title, checksStatus: checksStatus),
            "commits": [],
            "checks": [],
            "files": [],
            "reviews": [],
            "fromCache": false,
        ]
    }

    func deployment(issueNumber: Int) -> [String: Any] {
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

    func deployments(for issueNumber: Int) -> [[String: Any]] {
        if issueDetailDeploymentsLagBehindLaunch {
            return []
        }
        return activeDeployments.filter { $0["issue_number"] as? Int == issueNumber }
    }

    func sessionPreviews() -> [String: Any] {
        var previews: [String: Any] = [:]
        for deployment in activeDeployments {
            guard let port = deployment["ttyd_port"] as? Int else { continue }
            let issueNumber = deployment["issue_number"] as? Int ?? 0
            previews[String(port)] = [
                "lines": [
                    "issue #\(issueNumber): running checks",
                    issueNumber == 101 ? "pass: launch handoff" : "waiting for agent output",
                ],
                "lastUpdatedMs": 1_777_800_000_000,
                "lastChangedMs": 1_777_799_999_000,
                "status": issueNumber == 101 ? "active" : "idle",
            ]
        }
        return previews
    }

    // MARK: - Mutation helpers

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

    func activateDeployment(issueNumber: Int, request: String? = nil) {
        if let request {
            let payload = jsonBody(from: request)
            stateLock.lock()
            lastLaunchPayload = payload
            stateLock.unlock()
        }
        activeDeployments.removeAll { $0["issue_number"] as? Int == issueNumber }
        activeDeployments.append(deployment(issueNumber: issueNumber))
    }
}

final class FailureBox: @unchecked Sendable {
    var error: NWError?
}
