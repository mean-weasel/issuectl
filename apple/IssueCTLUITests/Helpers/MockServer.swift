import Network
import XCTest

final class MockIssueCTLServer: @unchecked Sendable {
    let baseURL: URL
    private let listener: NWListener
    private let queue = DispatchQueue(label: "MockIssueCTLServer")

    // Mutable state seeded before launch and mutated by endpoint handlers.
    private var activeDeployments: [[String: Any]] = []
    private var drafts: [[String: Any]] = []
    private var hiddenPreviewIssueNumbers: Set<Int> = []

    // Failure controls for recovery-path UI tests.
    var failUserProfile = false
    var failRepos = false
    var failDeployments = false
    var issueDetailDeploymentsLagBehindLaunch = false
    var dropIssueCommentRequests = false
    var dropIssueStateRequests = false

    // Settings controls.
    var defaultLaunchAgent = "claude"

    private let stateLock = NSLock()
    private var lastLaunchPayload: [String: Any] = [:]
    private var lastEndSessionPayload: [String: Any] = [:]
    private var lastRepoUpdatePayload: [String: Any] = [:]
    private var lastWebhookPayload: [String: Any] = [:]
    private var lastRepoLabelsPayload: [String: Any] = [:]
    private var lastIssueLabelPayload: [String: Any] = [:]
    private var lastPullLabelPayload: [String: Any] = [:]

    var lastLaunchAgent: String? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return lastLaunchPayload["agent"] as? String
    }

    var lastEndSessionTargetType: String? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return lastEndSessionPayload["targetType"] as? String
    }

    var lastEndSessionTargetNumber: Int? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return lastEndSessionPayload["targetNumber"] as? Int
    }

    var lastRepoUpdateAutoReviewPrs: Bool? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return lastRepoUpdatePayload["autoReviewPrs"] as? Bool
    }

    var lastWebhookAction: String? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return lastWebhookPayload["action"] as? String
    }

    var lastRepoLabelsAction: String? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return lastRepoLabelsPayload["action"] as? String
    }

    var lastIssueLabelAction: String? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return lastIssueLabelPayload["action"] as? String
    }

    var lastPullLabelAction: String? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return lastPullLabelPayload["action"] as? String
    }

    // Fixture state for extended test coverage.
    var issueStates: [Int: String] = [101: "open", 102: "open"]
    var issueComments: [Int: [[String: Any]]] = [:]
    var issueLabels: [Int: [[String: Any]]] = [
        101: [["name": "bug", "color": "d73a4a", "description": NSNull()]],
        102: [["name": "bug", "color": "d73a4a", "description": NSNull()]],
    ]
    var pullLabels: [Int: [[String: Any]]] = [:]
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
        hiddenPreviewIssueNumbers = []
        activeDeployments = [deployment(issueNumber: 101)]
    }

    func seedPullRequestDeployment() {
        hiddenPreviewIssueNumbers = []
        activeDeployments = [pullRequestDeployment(number: 7)]
    }

    func seedMixedActivityDeployments() {
        hiddenPreviewIssueNumbers = []
        activeDeployments = [
            deployment(issueNumber: 101),
            deployment(issueNumber: 102),
            deployment(issueNumber: 103),
        ]
    }

    func seedDeploymentsAcrossRepos() {
        hiddenPreviewIssueNumbers = []
        repos = [defaultRepo, betaRepo]
        activeDeployments = [
            deployment(issueNumber: 101),
            deployment(issueNumber: 201, repoId: 2, owner: "org", repoName: "beta"),
        ]
    }

    func seedDeploymentWithMissingPreview() {
        activeDeployments = [deployment(issueNumber: 101)]
        hiddenPreviewIssueNumbers = [101]
    }

    func seedClosedIssue(_ number: Int) {
        issueStates[number] = "closed"
    }

    func seedComments(for number: Int, comments: [[String: Any]]) {
        issueComments[number] = comments
    }

    func commentBodies(for number: Int) -> [String] {
        queue.sync {
            issueComments[number]?.compactMap { $0["body"] as? String } ?? []
        }
    }

    func issueState(for number: Int) -> String? {
        queue.sync {
            issueStates[number]
        }
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
                if self.shouldDropResponse(for: request) {
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

    private func shouldDropResponse(for request: String) -> Bool {
        let firstLine = request.split(separator: "\r\n", maxSplits: 1).first ?? ""
        let parts = firstLine.split(separator: " ")
        let method = parts.indices.contains(0) ? String(parts[0]) : "GET"
        let rawPath = parts.indices.contains(1) ? String(parts[1]) : "/"
        let path = rawPath.split(separator: "?", maxSplits: 1).first.map(String.init) ?? rawPath
        guard method == "POST", path.hasPrefix("/api/v1/issues/") else { return false }

        if dropIssueCommentRequests, path.hasSuffix("/comments") {
            return true
        }

        if dropIssueStateRequests, path.hasSuffix("/state") {
            return true
        }

        return false
    }

    // MARK: - Router

    private func response(for request: String) -> Data {
        let firstLine = request.split(separator: "\r\n", maxSplits: 1).first ?? ""
        let parts = firstLine.split(separator: " ")
        let method = parts.indices.contains(0) ? String(parts[0]) : "GET"
        let rawPath = parts.indices.contains(1) ? String(parts[1]) : "/"
        let path = rawPath.split(separator: "?", maxSplits: 1).first.map(String.init) ?? rawPath

        let pathSegments = path.split(separator: "/")
        if method == "POST",
           pathSegments.count == 5,
           pathSegments[0] == "api",
           pathSegments[1] == "v1",
           pathSegments[2] == "deployments",
           pathSegments[4] == "end",
           let deploymentId = Int(pathSegments[3]) {
            let payload = jsonBody(from: request)
            stateLock.lock()
            lastEndSessionPayload = payload
            stateLock.unlock()
            activeDeployments.removeAll { $0["id"] as? Int == deploymentId }
            return http(status: 200, json: ["success": true])
        }

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

        case ("GET", "/api/v1/repos/github"):
            body = [
                "repos": [
                    ["owner": "org", "name": "alpha", "private": false, "pushed_at": isoDate],
                    ["owner": "org", "name": "gamma", "private": true, "pushed_at": isoDate],
                ],
                "synced_at": 1_775_000_000,
                "is_stale": false,
            ]

        case ("POST", "/api/v1/repos"):
            let payload = jsonBody(from: request)
            guard
                let owner = payload["owner"] as? String,
                let name = payload["name"] as? String,
                !owner.isEmpty,
                !name.isEmpty
            else {
                return http(status: 400, json: ["success": false, "error": "invalid repo"])
            }
            let nextId = ((repos.compactMap { $0["id"] as? Int }.max() ?? 0) + 1)
            let repo: [String: Any] = [
                "id": nextId,
                "owner": owner,
                "name": name,
                "local_path": NSNull(),
                "branch_pattern": NSNull(),
                "created_at": isoDate,
            ]
            repos.insert(repo, at: 0)
            body = ["success": true, "repo": repo]

        case ("DELETE", "/api/v1/repos/org/alpha"):
            repos.removeAll { $0["name"] as? String == "alpha" }
            body = ["success": true]

        case ("PATCH", "/api/v1/repos/org/alpha"):
            let payload = jsonBody(from: request)
            stateLock.lock()
            lastRepoUpdatePayload = payload
            stateLock.unlock()
            if let idx = repos.firstIndex(where: { $0["name"] as? String == "alpha" }) {
                for (key, value) in payload {
                    repos[idx][key] = value
                }
                if let autoLaunchIssues = payload["autoLaunchIssues"] {
                    repos[idx]["auto_launch_issues"] = autoLaunchIssues
                }
                if let autoReviewPrs = payload["autoReviewPrs"] {
                    repos[idx]["auto_review_prs"] = autoReviewPrs
                }
                if let issueAgent = payload["issueAgent"] {
                    repos[idx]["issue_agent"] = issueAgent
                }
                if let reviewAgent = payload["reviewAgent"] {
                    repos[idx]["review_agent"] = reviewAgent
                }
                if let webhookPayloadMode = payload["webhookPayloadMode"] {
                    repos[idx]["webhook_payload_mode"] = webhookPayloadMode
                }
                if let reviewPreamble = payload["reviewPreamble"] {
                    repos[idx]["review_preamble"] = reviewPreamble
                }
                body = ["success": true, "repo": repos[idx]]
            } else {
                return http(status: 404, json: ["success": false, "error": "repo not found"])
            }

        case ("GET", "/api/v1/repos/org/alpha/labels"):
            body = ["labels": repoLabels]

        case ("POST", "/api/v1/repos/org/alpha/labels"):
            let payload = jsonBody(from: request)
            stateLock.lock()
            lastRepoLabelsPayload = payload
            stateLock.unlock()
            body = ["success": true, "error": NSNull()]

        case ("POST", "/api/v1/repos/org/alpha/webhook"):
            let payload = jsonBody(from: request)
            stateLock.lock()
            lastWebhookPayload = payload
            stateLock.unlock()
            if let idx = repos.firstIndex(where: { $0["name"] as? String == "alpha" }) {
                repos[idx]["webhook_id"] = repos[idx]["webhook_id"] ?? 123
            }
            body = [
                "success": true,
                "repo": repos.first ?? defaultRepo,
                "webhook": ["id": 123, "url": "https://hooks.example.test/api/webhook/github/1", "created_by": "mock"],
                "error": NSNull(),
            ]

        case ("GET", "/api/v1/repos/org/alpha/webhook/health"):
            body = [
                "health": [
                    "state": "warning",
                    "summary": "Webhook not verified",
                    "detail": "Send a ping before relying on automation labels.",
                    "recovery": "Open repo settings and reinstall the webhook.",
                    "expectedUrl": "https://hooks.example.test/api/webhook/github/1",
                    "hookId": 123,
                    "githubUrl": "https://github.com/org/alpha/settings/hooks/123",
                    "latestDelivery": NSNull(),
                ],
            ]

        case ("GET", "/api/v1/workbench"):
            body = workbenchPayload()

        case ("GET", "/api/v1/deployments"):
            if failDeployments {
                return http(status: 500, json: ["error": "deployments unavailable"])
            }
            body = ["deployments": activeDeployments]

        case ("GET", "/api/v1/sessions/previews"):
            body = ["previews": sessionPreviews()]

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
            stateLock.lock()
            lastIssueLabelPayload = payload
            stateLock.unlock()
            if let name = (payload["label"] as? String) ?? (payload["name"] as? String) {
                var labels = issueLabels[101] ?? []
                if payload["action"] as? String == "remove",
                   let idx = labels.firstIndex(where: { $0["name"] as? String == name }) {
                    labels.remove(at: idx)
                } else if !labels.contains(where: { $0["name"] as? String == name }) {
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

        case ("POST", "/api/v1/pulls/org/alpha/7/labels"):
            updatePullLabels(number: 7, request: request)
            body = ["success": true, "error": NSNull()]

        case ("POST", "/api/v1/pulls/org/alpha/8/labels"):
            updatePullLabels(number: 8, request: request)
            body = ["success": true, "error": NSNull()]

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
            "auto_launch_issues": true,
            "auto_review_prs": true,
            "issue_agent": "codex",
            "review_agent": "claude",
            "webhook_id": 123,
            "webhook_payload_mode": "metadata",
            "review_preamble": NSNull(),
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
            "auto_launch_issues": false,
            "auto_review_prs": false,
            "issue_agent": "claude",
            "review_agent": "claude",
            "webhook_id": NSNull(),
            "webhook_payload_mode": "metadata",
            "review_preamble": NSNull(),
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
            ["name": "issuectl:auto-launch", "color": "2da44e", "description": "Launch an issue work session from webhook labels"],
            ["name": "issuectl:auto-review", "color": "8250df", "description": "Create a PR review session from webhook labels"],
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
            "labels": pullLabels[number] ?? [],
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

    func deployment(issueNumber: Int, repoId: Int = 1, owner: String = "org", repoName: String = "alpha") -> [String: Any] {
        let id = 8900 + issueNumber
        return [
            "id": id,
            "repo_id": repoId,
            "issue_number": issueNumber,
            "target_type": "issue",
            "target_number": issueNumber,
            "agent": "codex",
            "terminal_backend": "ttyd",
            "triggered_by": "manual",
            "terminal_reason": NSNull(),
            "parent_deployment_id": NSNull(),
            "webhook_depth": 0,
            "idle_since": NSNull(),
            "branch_name": branchName(for: issueNumber),
            "workspace_mode": "worktree",
            "workspace_path": "/tmp/\(repoName)-worktree-\(issueNumber)",
            "linked_pr_number": NSNull(),
            "state": "active",
            "launched_at": "2026-04-29 08:00:00",
            "ended_at": NSNull(),
            "ttyd_port": 19000 + issueNumber,
            "ttyd_pid": 12000 + issueNumber,
            "owner": owner,
            "repo_name": repoName,
        ]
    }

    func pullRequestDeployment(number: Int, repoId: Int = 1, owner: String = "org", repoName: String = "alpha") -> [String: Any] {
        let id = 9500 + number
        return [
            "id": id,
            "repo_id": repoId,
            "issue_number": NSNull(),
            "target_type": "pr",
            "target_number": number,
            "agent": "codex",
            "terminal_backend": "ttyd",
            "triggered_by": "webhook",
            "terminal_reason": "review",
            "parent_deployment_id": NSNull(),
            "webhook_depth": 1,
            "idle_since": NSNull(),
            "branch_name": "pr-\(number)-review",
            "workspace_mode": "worktree",
            "workspace_path": "/tmp/\(repoName)-pr-\(number)",
            "linked_pr_number": NSNull(),
            "state": "active",
            "launched_at": "2026-04-29 08:00:00",
            "ended_at": NSNull(),
            "ttyd_port": 19500 + number,
            "ttyd_pid": 12500 + number,
            "owner": owner,
            "repo_name": repoName,
        ]
    }

    func workbenchPayload() -> [String: Any] {
        [
            "repos": repos.map { repo in
                let repoId = repo["id"] as? Int ?? 0
                let owner = repo["owner"] as? String ?? "org"
                let name = repo["name"] as? String ?? "alpha"
                let repoDeployments = activeDeployments.filter { ($0["repo_id"] as? Int) == repoId }
                return [
                    "id": repoId,
                    "owner": owner,
                    "name": name,
                    "localPath": repo["local_path"] ?? NSNull(),
                    "branchPattern": repo["branch_pattern"] ?? NSNull(),
                    "autoLaunchIssues": repo["auto_launch_issues"] ?? false,
                    "autoReviewPrs": repo["auto_review_prs"] ?? false,
                    "issueAgent": repo["issue_agent"] ?? "claude",
                    "reviewAgent": repo["review_agent"] ?? "claude",
                    "webhookId": repo["webhook_id"] ?? NSNull(),
                    "webhookPayloadMode": repo["webhook_payload_mode"] ?? "metadata",
                    "badgeCount": repoDeployments.count,
                    "deployedCount": repoDeployments.count,
                    "launchAgent": "codex",
                    "terminalBackendDefault": "ttyd",
                    "issueError": NSNull(),
                    "issuesFromCache": false,
                    "issuesCachedAt": NSNull(),
                    "priorities": [
                        ["repoId": repoId, "issueNumber": 101, "priority": issuePriorities[101] ?? "normal", "updatedAt": 1_777_440_000],
                    ],
                    "deployments": repoDeployments.map(workbenchDeployment),
                    "recentCompletions": [],
                    "webhookEvents": [
                        [
                            "id": 1,
                            "deliveryId": "mock-delivery",
                            "eventType": "issues",
                            "action": "labeled",
                            "senderLogin": "alice",
                            "targetType": "issue",
                            "targetNumber": 101,
                            "receivedAt": 1_777_440_000,
                            "intentId": 1,
                        ],
                    ],
                    "prReviews": [
                        [
                            "id": 1,
                            "repoId": repoId,
                            "prNumber": 7,
                            "deploymentId": NSNull(),
                            "reviewedFromSha": NSNull(),
                            "reviewedToSha": "abc",
                            "headRepoFullName": "\(owner)/\(name)",
                            "headRef": "feature-7",
                            "status": "reserved",
                            "triggeredBy": "webhook",
                            "resultJson": NSNull(),
                            "startedAt": 1_777_440_000,
                            "completedAt": NSNull(),
                        ],
                    ],
                    "previews": sessionPreviews(),
                    "issues": workbenchIssues(owner: owner, name: name, repoDeployments: repoDeployments),
                ]
            },
            "deployments": activeDeployments.map(workbenchDeployment),
            "previews": sessionPreviews(),
            "settings": ["launch_agent": defaultLaunchAgent],
            "health": ["ok": true, "version": "ui-test", "timestamp": isoDate, "error": NSNull()],
            "user": ["login": "alice", "error": NSNull()],
            "generatedAt": isoDate,
        ]
    }

    private func workbenchDeployment(_ deployment: [String: Any]) -> [String: Any] {
        [
            "id": deployment["id"] ?? 0,
            "repoId": deployment["repo_id"] ?? 0,
            "issueNumber": deployment["issue_number"] ?? NSNull(),
            "targetType": deployment["target_type"] ?? "issue",
            "targetNumber": deployment["target_number"] ?? deployment["issue_number"] ?? 0,
            "agent": deployment["agent"] ?? "codex",
            "terminalBackend": deployment["terminal_backend"] ?? "ttyd",
            "triggeredBy": deployment["triggered_by"] ?? "manual",
            "terminalReason": deployment["terminal_reason"] ?? NSNull(),
            "parentDeploymentId": deployment["parent_deployment_id"] ?? NSNull(),
            "webhookDepth": deployment["webhook_depth"] ?? 0,
            "idleSince": deployment["idle_since"] ?? NSNull(),
            "branchName": deployment["branch_name"] ?? "",
            "workspaceMode": deployment["workspace_mode"] ?? "worktree",
            "workspacePath": deployment["workspace_path"] ?? "",
            "linkedPrNumber": deployment["linked_pr_number"] ?? NSNull(),
            "state": deployment["state"] ?? "active",
            "launchedAt": deployment["launched_at"] ?? isoDate,
            "endedAt": deployment["ended_at"] ?? NSNull(),
            "ttydPort": deployment["ttyd_port"] ?? NSNull(),
            "ttydPid": deployment["ttyd_pid"] ?? NSNull(),
            "owner": deployment["owner"] ?? "org",
            "repoName": deployment["repo_name"] ?? "alpha",
        ]
    }

    private func workbenchIssues(owner: String, name: String, repoDeployments: [[String: Any]]) -> [[String: Any]] {
        switch name {
        case "alpha":
            return [
                [
                    "number": 101,
                    "title": "Improve launch handoff",
                    "state": issueStates[101] ?? "open",
                    "labels": ["issuectl:auto-launch"],
                    "updatedAt": isoDate,
                    "priority": issuePriorities[101] ?? "normal",
                    "hasActiveDeployment": repoDeployments.contains { ($0["issue_number"] as? Int) == 101 },
                    "htmlUrl": "https://github.com/\(owner)/\(name)/issues/101",
                    "authorLogin": "alice",
                ],
            ]
        case "beta":
            return [
                [
                    "number": 201,
                    "title": "Beta repo board coverage",
                    "state": issueStates[201] ?? "open",
                    "labels": ["board"],
                    "updatedAt": isoDate,
                    "priority": issuePriorities[201] ?? "normal",
                    "hasActiveDeployment": repoDeployments.contains { ($0["issue_number"] as? Int) == 201 },
                    "htmlUrl": "https://github.com/\(owner)/\(name)/issues/201",
                    "authorLogin": "bob",
                ],
            ]
        default:
            return []
        }
    }

    private func branchName(for issueNumber: Int) -> String {
        switch issueNumber {
        case 101:
            return "issue-101-improve-launch-handoff"
        case 102:
            return "issue-102-persist-multiple-sessions"
        default:
            return "issue-\(issueNumber)-terminal-activity"
        }
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
            let targetType = deployment["target_type"] as? String ?? "issue"
            let targetNumber = (deployment["target_number"] as? Int) ?? (deployment["issue_number"] as? Int) ?? 0
            guard !hiddenPreviewIssueNumbers.contains(targetNumber) else { continue }
            let targetLabel = targetType == "pr" ? "PR #\(targetNumber)" : "issue #\(targetNumber)"
            previews[String(port)] = [
                "lines": [
                    "\(targetLabel): running checks",
                    targetNumber == 101 ? "pass: launch handoff" : "waiting for agent output",
                ],
                "lastUpdatedMs": 1_777_800_000_000,
                "lastChangedMs": 1_777_799_999_000,
                "status": targetNumber == 102 ? "idle" : "active",
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

    private func updatePullLabels(number: Int, request: String) {
        let payload = jsonBody(from: request)
        stateLock.lock()
        lastPullLabelPayload = payload
        stateLock.unlock()

        guard let name = (payload["label"] as? String) ?? (payload["name"] as? String) else {
            return
        }

        var labels = pullLabels[number] ?? []
        if payload["action"] as? String == "remove",
           let idx = labels.firstIndex(where: { $0["name"] as? String == name }) {
            labels.remove(at: idx)
        } else if !labels.contains(where: { $0["name"] as? String == name }) {
            labels.append(["name": name, "color": "8250df", "description": NSNull()])
        }
        pullLabels[number] = labels
    }
}

final class FailureBox: @unchecked Sendable {
    var error: NWError?
}
