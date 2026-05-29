import XCTest
@testable import IssueCTL

// MARK: - URLProtocol Mock

final class MockURLProtocol: URLProtocol {
    nonisolated(unsafe) static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.requestHandler else {
            XCTFail("No request handler set")
            return
        }

        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

private func requestBodyData(_ request: URLRequest) throws -> Data {
    if let httpBody = request.httpBody {
        return httpBody
    }
    guard let bodyStream = request.httpBodyStream else {
        throw NSError(domain: "IssueCTLTests", code: 1, userInfo: [NSLocalizedDescriptionKey: "Request has no body"])
    }

    bodyStream.open()
    defer { bodyStream.close() }

    var data = Data()
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 1024)
    defer { buffer.deallocate() }

    while bodyStream.hasBytesAvailable {
        let read = bodyStream.read(buffer, maxLength: 1024)
        if read > 0 {
            data.append(buffer, count: read)
        } else if read < 0 {
            throw bodyStream.streamError ?? NSError(domain: "IssueCTLTests", code: 2)
        } else {
            break
        }
    }

    return data
}

// MARK: - Testable APIClient subclass

/// A testable version of APIClient that uses a custom URLSession with MockURLProtocol.
/// Since APIClient uses URLSession.shared, we override the request method to use our mock session.
@MainActor
final class TestableAPIClient {
    let session: URLSession
    let serverURL: String
    let apiToken: String

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    init(serverURL: String = "http://localhost:3847", apiToken: String = "test-token-123") {
        self.serverURL = serverURL
        self.apiToken = apiToken

        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        self.session = URLSession(configuration: config)
    }

    func request(path: String, method: String = "GET", body: Data? = nil, timeoutInterval: TimeInterval? = nil) async throws -> (Data, HTTPURLResponse) {
        guard let base = URL(string: serverURL) else {
            throw APIError.notConfigured
        }

        guard let url = URL(string: path, relativeTo: base)?.absoluteURL else {
            throw APIError.invalidPath(path)
        }

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = method
        urlRequest.setValue("Bearer \(apiToken)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { urlRequest.httpBody = body }
        if let timeoutInterval { urlRequest.timeoutInterval = timeoutInterval }

        let (data, response) = try await session.data(for: urlRequest)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }
        if httpResponse.statusCode >= 400 {
            let errorBody = try? JSONDecoder().decode(ErrorBody.self, from: data)
            throw APIError.serverError(httpResponse.statusCode, errorBody?.error ?? "Unknown error")
        }

        return (data, httpResponse)
    }

    // Duplicates key endpoint logic from APIClient for testing
    func health() async throws -> ServerHealth {
        let (data, _) = try await request(path: "/api/v1/health")
        return try decoder.decode(ServerHealth.self, from: data)
    }

    func repos() async throws -> [Repo] {
        let (data, _) = try await request(path: "/api/v1/repos")
        return try decoder.decode(ReposResponse.self, from: data).repos
    }

    func addRepo(owner: String, name: String) async throws -> Repo {
        let body = AddRepoRequest(owner: owner, name: name)
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/repos", method: "POST", body: bodyData)
        let response = try decoder.decode(AddRepoResponse.self, from: data)
        guard response.success, let repo = response.repo else {
            throw APIError.serverError(400, response.error ?? "Failed to add repository")
        }
        return repo
    }

    func removeRepo(owner: String, name: String) async throws {
        let (data, _) = try await request(path: "/api/v1/repos/\(owner)/\(name)", method: "DELETE", body: nil)
        let response = try decoder.decode(RemoveRepoResponse.self, from: data)
        guard response.success else {
            throw APIError.serverError(400, response.error ?? "Failed to remove repository")
        }
    }

    func githubRepos(refresh: Bool = false) async throws -> GitHubAccessibleReposResponse {
        var path = "/api/v1/repos/github"
        if refresh { path += "?refresh=true" }
        let (data, _) = try await request(path: path)
        return try decoder.decode(GitHubAccessibleReposResponse.self, from: data)
    }

    func updateRepo(
        owner: String,
        name: String,
        localPath: String? = nil,
        branchPattern: String? = nil,
        autoLaunchIssues: Bool? = nil,
        autoReviewPrs: Bool? = nil,
        issueAgent: LaunchAgent? = nil,
        reviewAgent: LaunchAgent? = nil,
        reviewPreamble: String? = nil,
        webhookPayloadMode: WebhookPayloadMode? = nil
    ) async throws -> Repo {
        let body = UpdateRepoRequest(
            localPath: localPath,
            branchPattern: branchPattern,
            autoLaunchIssues: autoLaunchIssues,
            autoReviewPrs: autoReviewPrs,
            issueAgent: issueAgent,
            reviewAgent: reviewAgent,
            reviewPreamble: reviewPreamble,
            webhookPayloadMode: webhookPayloadMode
        )
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/repos/\(owner)/\(name)", method: "PATCH", body: bodyData)
        let response = try decoder.decode(UpdateRepoResponse.self, from: data)
        guard response.success, let repo = response.repo else {
            throw APIError.serverError(400, response.error ?? "Failed to update repository")
        }
        return repo
    }

    func workbench() async throws -> WorkbenchPayload {
        let (data, _) = try await request(path: "/api/v1/workbench")
        return try decoder.decode(WorkbenchPayload.self, from: data)
    }

    func configureWebhook(owner: String, repo: String, action: WebhookAction) async throws -> WebhookConfigurationResponse {
        let bodyData = try JSONEncoder().encode(WebhookActionRequest(action: action))
        let (data, _) = try await request(path: "/api/v1/repos/\(owner)/\(repo)/webhook", method: "POST", body: bodyData)
        return try decoder.decode(WebhookConfigurationResponse.self, from: data)
    }

    func webhookHealth(owner: String, repo: String) async throws -> WebhookAutomationHealth {
        let (data, _) = try await request(path: "/api/v1/repos/\(owner)/\(repo)/webhook/health")
        return try decoder.decode(WebhookHealthResponse.self, from: data).health
    }

    func recreateRepoLabels(owner: String, repo: String) async throws -> RepoLabelsRecreateResponse {
        let bodyData = try JSONEncoder().encode(RecreateRepoLabelsRequest())
        let (data, _) = try await request(path: "/api/v1/repos/\(owner)/\(repo)/labels", method: "POST", body: bodyData)
        return try decoder.decode(RepoLabelsRecreateResponse.self, from: data)
    }

    func togglePullLabel(owner: String, repo: String, number: Int, body: ToggleLabelRequestBody) async throws -> ToggleLabelResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/pulls/\(owner)/\(repo)/\(number)/labels", method: "POST", body: bodyData)
        return try decoder.decode(ToggleLabelResponse.self, from: data)
    }

    func getSettings() async throws -> [String: String] {
        let (data, _) = try await request(path: "/api/v1/settings")
        return try decoder.decode(SettingsResponse.self, from: data).settings
    }

    func updateSettings(_ updates: [String: String]) async throws -> SuccessResponse {
        let bodyData = try JSONEncoder().encode(updates)
        let (data, _) = try await request(path: "/api/v1/settings", method: "PATCH", body: bodyData)
        return try decoder.decode(SuccessResponse.self, from: data)
    }

    func listWorktrees() async throws -> [WorktreeInfo] {
        let (data, _) = try await request(path: "/api/v1/worktrees")
        return try decoder.decode(WorktreesResponse.self, from: data).worktrees
    }

    func cleanupWorktree(path: String) async throws -> SuccessResponse {
        let body = WorktreeCleanupRequest(path: path)
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/worktrees/cleanup", method: "POST", body: bodyData)
        return try decoder.decode(SuccessResponse.self, from: data)
    }

    func cleanupStaleWorktrees() async throws -> WorktreeCleanupResponse {
        let body: [String: String?] = [:]
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/worktrees/cleanup", method: "POST", body: bodyData)
        return try decoder.decode(WorktreeCleanupResponse.self, from: data)
    }

    func issues(owner: String, repo: String, refresh: Bool = false) async throws -> IssuesResponse {
        var path = "/api/v1/issues/\(owner)/\(repo)"
        if refresh { path += "?refresh=true" }
        let (data, _) = try await request(path: path)
        return try decoder.decode(IssuesResponse.self, from: data)
    }

    func pulls(owner: String, repo: String) async throws -> PullsResponse {
        let (data, _) = try await request(path: "/api/v1/pulls/\(owner)/\(repo)")
        return try decoder.decode(PullsResponse.self, from: data)
    }

    func activeDeployments() async throws -> ActiveDeploymentsResponse {
        let (data, _) = try await request(path: "/api/v1/deployments")
        return try decoder.decode(ActiveDeploymentsResponse.self, from: data)
    }

    func sessionPreviews() async throws -> SessionPreviewsResponse {
        let (data, _) = try await request(path: "/api/v1/sessions/previews")
        return try decoder.decode(SessionPreviewsResponse.self, from: data)
    }

    func webhookEvents(
        owner: String,
        repo: String,
        targetType: DeploymentTargetType? = nil,
        targetNumber: Int? = nil,
        limit: Int = 50
    ) async throws -> WebhookEventsResponse {
        var components = URLComponents()
        components.path = "/api/v1/repos/\(owner)/\(repo)/webhook/events"
        components.queryItems = [
            targetType.map { URLQueryItem(name: "targetType", value: $0.rawValue) },
            targetNumber.map { URLQueryItem(name: "targetNumber", value: String($0)) },
            URLQueryItem(name: "limit", value: String(limit))
        ].compactMap { $0 }
        let (data, _) = try await request(path: components.string ?? components.path)
        return try decoder.decode(WebhookEventsResponse.self, from: data)
    }

    func reviewRuns(
        owner: String,
        repo: String,
        pr: Int? = nil,
        status: ReviewRunStatusFilter = .all,
        limit: Int = 24
    ) async throws -> ReviewRunsResponse {
        var components = URLComponents()
        components.path = "/api/v1/repos/\(owner)/\(repo)/review-runs"
        components.queryItems = [
            pr.map { URLQueryItem(name: "pr", value: String($0)) },
            URLQueryItem(name: "status", value: status.rawValue),
            URLQueryItem(name: "limit", value: String(limit))
        ].compactMap { $0 }
        let (data, _) = try await request(path: components.string ?? components.path)
        return try decoder.decode(ReviewRunsResponse.self, from: data)
    }

    func diagnostics(deploymentId: Int) async throws -> DiagnosticsResponse {
        let (data, _) = try await request(path: "/api/v1/diagnostics?deploymentId=\(deploymentId)")
        return try decoder.decode(DiagnosticsResponse.self, from: data)
    }

    func deploymentDiagnostics(deploymentId: Int, limit: Int = 50) async throws -> DeploymentDiagnosticsResponse {
        let safeLimit = max(1, min(200, limit))
        let (data, _) = try await request(path: "/api/v1/diagnostics/deployments/\(deploymentId)?limit=\(safeLimit)")
        return try decoder.decode(DeploymentDiagnosticsResponse.self, from: data)
    }

    func agentMutation(body: AgentMutationRequestBody) async throws -> AgentMutationDecision {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/agent/mutations", method: "POST", body: bodyData)
        return try decoder.decode(AgentMutationDecision.self, from: data)
    }

    func agentCompletion(body: AgentCompletionRequestBody) async throws -> AgentCompletionResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/agent/completion", method: "POST", body: bodyData)
        return try decoder.decode(AgentCompletionResponse.self, from: data)
    }

    func parseNaturalLanguage(input: String) async throws -> ParsedIssuesData {
        let body = ParseRequestBody(input: input)
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(
            path: "/api/v1/parse",
            method: "POST",
            body: bodyData,
            timeoutInterval: 120
        )
        return try decoder.decode(ParseResponse.self, from: data).parsed
    }

    private struct ErrorBody: Codable {
        let error: String
    }
}

// MARK: - Tests

final class APIClientTests: XCTestCase {

    private var client: TestableAPIClient!

    @MainActor
    override func setUp() async throws {
        try await super.setUp()
        client = TestableAPIClient()
    }

    override func tearDown() {
        MockURLProtocol.requestHandler = nil
        super.tearDown()
    }

    // MARK: - Auth Header

    @MainActor
    func testAuthTokenIncludedInHeaders() async throws {
        MockURLProtocol.requestHandler = { request in
            // Verify the auth header
            let authHeader = request.value(forHTTPHeaderField: "Authorization")
            XCTAssertEqual(authHeader, "Bearer test-token-123")

            let contentType = request.value(forHTTPHeaderField: "Content-Type")
            XCTAssertEqual(contentType, "application/json")

            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            let data = """
            {"ok": true, "version": "1.0.0", "timestamp": "2026-04-27T00:00:00Z"}
            """.data(using: .utf8)!
            return (response, data)
        }

        _ = try await client.health()
    }

    @MainActor
    func testCustomTokenInHeaders() async throws {
        let customClient = TestableAPIClient(apiToken: "my-secret-key")

        MockURLProtocol.requestHandler = { request in
            let authHeader = request.value(forHTTPHeaderField: "Authorization")
            XCTAssertEqual(authHeader, "Bearer my-secret-key")

            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: nil
            )!
            let data = """
            {"ok": true, "version": "1.0.0", "timestamp": "2026-04-27T00:00:00Z"}
            """.data(using: .utf8)!
            return (response, data)
        }

        _ = try await customClient.health()
    }

    // MARK: - URL Construction

    @MainActor
    func testHealthEndpointURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/health"))
            XCTAssertEqual(request.httpMethod, "GET")

            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = """
            {"ok": true, "version": "1.0.0", "timestamp": "2026-04-27T00:00:00Z"}
            """.data(using: .utf8)!
            return (response, data)
        }

        _ = try await client.health()
    }

    @MainActor
    func testReposEndpointURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/repos"))
            XCTAssertEqual(request.httpMethod, "GET")

            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = """
            {"repos": []}
            """.data(using: .utf8)!
            return (response, data)
        }

        _ = try await client.repos()
    }

    @MainActor
    func testIssuesEndpointURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.contains("/api/v1/issues/neonwatty/issuectl"))
            XCTAssertEqual(request.httpMethod, "GET")

            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = """
            {"issues": [], "from_cache": false, "cached_at": null}
            """.data(using: .utf8)!
            return (response, data)
        }

        _ = try await client.issues(owner: "neonwatty", repo: "issuectl")
    }

    @MainActor
    func testIssuesRefreshQueryParam() async throws {
        MockURLProtocol.requestHandler = { request in
            let urlString = request.url!.absoluteString
            XCTAssertTrue(urlString.contains("refresh=true"), "URL should contain refresh=true, got: \(urlString)")

            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = """
            {"issues": [], "from_cache": false, "cached_at": null}
            """.data(using: .utf8)!
            return (response, data)
        }

        _ = try await client.issues(owner: "org", repo: "app", refresh: true)
    }

    @MainActor
    func testPullsEndpointURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.contains("/api/v1/pulls/org/repo"))

            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = """
            {"pulls": [], "from_cache": false, "cached_at": null}
            """.data(using: .utf8)!
            return (response, data)
        }

        _ = try await client.pulls(owner: "org", repo: "repo")
    }

    @MainActor
    func testDeploymentsEndpointURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/deployments"))

            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = """
            {"deployments": []}
            """.data(using: .utf8)!
            return (response, data)
        }

        _ = try await client.activeDeployments()
    }

    @MainActor
    func testSessionPreviewsEndpointURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/sessions/previews"))

            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = """
            {"previews": {}}
            """.data(using: .utf8)!
            return (response, data)
        }

        _ = try await client.sessionPreviews()
    }

    @MainActor
    func testAutomationListEndpointURLs() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.url!.path, "/api/v1/repos/org/alpha/webhook/events")
            XCTAssertTrue(request.url!.query?.contains("limit=50") == true)
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, #"{"events":[],"from_cache":false,"cached_at":null}"#.data(using: .utf8)!)
        }

        _ = try await client.webhookEvents(owner: "org", repo: "alpha")

        MockURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.url!.path, "/api/v1/repos/org/alpha/review-runs")
            XCTAssertTrue(request.url!.query?.contains("status=all") == true)
            XCTAssertTrue(request.url!.query?.contains("limit=24") == true)
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, #"{"review_runs":[],"from_cache":false,"cached_at":null}"#.data(using: .utf8)!)
        }

        _ = try await client.reviewRuns(owner: "org", repo: "alpha")

        MockURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.url!.path, "/api/v1/diagnostics")
            XCTAssertEqual(request.url!.query, "deploymentId=42")
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, #"{"events":[]}"#.data(using: .utf8)!)
        }

        _ = try await client.diagnostics(deploymentId: 42)
    }

    @MainActor
    func testDeploymentDiagnosticsEndpointURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/diagnostics/deployments/9001"))
            XCTAssertEqual(request.url?.query, "limit=25")
            XCTAssertEqual(request.httpMethod, "GET")

            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = """
            {
              "events": [],
              "filters": {"deployment_id": 9001, "target_type": null, "target_number": null, "limit": 25},
              "summary": {"count": 0, "level_counts": {}, "latest_timestamp": null, "latest_timestamp_iso": null}
            }
            """.data(using: .utf8)!
            return (response, data)
        }

        _ = try await client.deploymentDiagnostics(deploymentId: 9001, limit: 25)
    }

    @MainActor
    func testAutomationListEndpointFilters() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.url!.path, "/api/v1/repos/mean-weasel/issuectl/webhook/events")
            XCTAssertTrue(request.url!.query?.contains("targetType=issue") == true)
            XCTAssertTrue(request.url!.query?.contains("targetNumber=560") == true)
            XCTAssertTrue(request.url!.query?.contains("limit=10") == true)
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, #"{"events":[],"repos":[],"filters":{"repo":"mean-weasel/issuectl","target_type":"issue","target_number":560,"limit":10},"summary":{"count":0,"latest_received_at":null,"latest_received_at_iso":null,"result_counts":{}},"from_cache":false,"cached_at":null}"#.data(using: .utf8)!)
        }

        let webhookResponse = try await client.webhookEvents(
            owner: "mean-weasel",
            repo: "issuectl",
            targetType: .issue,
            targetNumber: 560,
            limit: 10
        )
        XCTAssertEqual(webhookResponse.filters?.targetNumber, 560)

        MockURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.url!.path, "/api/v1/repos/mean-weasel/issuectl/review-runs")
            XCTAssertTrue(request.url!.query?.contains("pr=563") == true)
            XCTAssertTrue(request.url!.query?.contains("status=completed") == true)
            XCTAssertTrue(request.url!.query?.contains("limit=5") == true)
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, #"{"review_runs":[],"from_cache":false,"cached_at":null}"#.data(using: .utf8)!)
        }

        let reviewResponse = try await client.reviewRuns(
            owner: "mean-weasel",
            repo: "issuectl",
            pr: 563,
            status: .completed,
            limit: 5
        )
        XCTAssertTrue(reviewResponse.reviewRuns.isEmpty)
    }

    @MainActor
    func testAgentMutationEndpointEncodesAutomationContract() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.url!.path, "/api/v1/agent/mutations")
            XCTAssertEqual(request.httpMethod, "POST")
            let body = try requestBodyData(request)
            let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(json["deploymentId"] as? Int, 42)
            XCTAssertEqual(json["completionToken"] as? String, "token")
            XCTAssertEqual(json["targetType"] as? String, "pr")
            XCTAssertEqual(json["actionType"] as? String, "comment")
            XCTAssertEqual((json["payload"] as? [String: Any])?["body"] as? String, "LGTM")

            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, #"{"allowed":true}"#.data(using: .utf8)!)
        }

        let decision = try await client.agentMutation(body: AgentMutationRequestBody(
            deploymentId: 42,
            completionToken: "token",
            repoId: 7,
            targetType: .pr,
            targetNumber: 88,
            actionType: .comment,
            payload: .object(["body": .string("LGTM")])
        ))

        XCTAssertTrue(decision.allowed)
        XCTAssertNil(decision.reason)
    }

    @MainActor
    func testAgentCompletionEndpointEncodesAutomationContract() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.url!.path, "/api/v1/agent/completion")
            XCTAssertEqual(request.httpMethod, "POST")
            let body = try requestBodyData(request)
            let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(json["deploymentId"] as? Int, 42)
            XCTAssertEqual(json["status"] as? String, "pushed_fixes")
            XCTAssertEqual(json["summary"] as? String, "Fixed one finding.")
            XCTAssertEqual(json["fixedFindingCount"] as? Int, 1)

            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, #"{"accepted":true,"duplicate":false}"#.data(using: .utf8)!)
        }

        let result = try await client.agentCompletion(body: AgentCompletionRequestBody(
            deploymentId: 42,
            completionToken: "token",
            status: .pushedFixes,
            summary: "Fixed one finding.",
            finalHeadSha: "def456",
            pushedCommitSha: "def456",
            pushedCommits: ["def456"],
            changedFileCount: 2,
            fixedFindingCount: 1,
            errorMessage: nil
        ))

        XCTAssertTrue(result.accepted)
        XCTAssertFalse(result.duplicate)
        XCTAssertNil(result.reason)
    }

    @MainActor
    func testWorkbenchEndpointURL() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url!.path.hasSuffix("/api/v1/workbench"))
            XCTAssertEqual(request.httpMethod, "GET")

            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = """
            {"repos":[],"deployments":[],"previews":{},"settings":{},"health":{"ok":true,"version":null,"timestamp":null,"error":null},"user":{"login":null,"error":null},"generatedAt":"2026-04-27T00:00:00Z"}
            """.data(using: .utf8)!
            return (response, data)
        }

        let payload = try await client.workbench()
        XCTAssertTrue(payload.repos.isEmpty)
        XCTAssertTrue(payload.health.ok)
    }

    // MARK: - Successful Responses

    @MainActor
    func testHealthSuccessfulDecode() async throws {
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = """
            {"ok": true, "version": "2.5.0", "timestamp": "2026-04-27T12:00:00Z"}
            """.data(using: .utf8)!
            return (response, data)
        }

        let health = try await client.health()
        XCTAssertTrue(health.ok)
        XCTAssertEqual(health.version, "2.5.0")
    }

    @MainActor
    func testReposSuccessfulDecode() async throws {
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = """
            {
                "repos": [
                    {"id": 1, "owner": "org", "name": "app", "local_path": "/dev/app", "branch_pattern": null, "created_at": "2026-01-01T00:00:00Z"}
                ]
            }
            """.data(using: .utf8)!
            return (response, data)
        }

        let repos = try await client.repos()
        XCTAssertEqual(repos.count, 1)
        XCTAssertEqual(repos[0].owner, "org")
        XCTAssertEqual(repos[0].name, "app")
    }

    @MainActor
    func testIssuesSuccessfulDecode() async throws {
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = """
            {
                "issues": [
                    {
                        "number": 5,
                        "title": "Bug",
                        "body": "desc",
                        "state": "open",
                        "labels": [],
                        "assignees": [],
                        "user": {"login": "dev", "avatar_url": "https://x.com"},
                        "comment_count": 2,
                        "created_at": "2026-04-01T00:00:00Z",
                        "updated_at": "2026-04-02T00:00:00Z",
                        "closed_at": null,
                        "html_url": "https://github.com/org/app/issues/5"
                    }
                ],
                "from_cache": true,
                "cached_at": "2026-04-27T00:00:00Z"
            }
            """.data(using: .utf8)!
            return (response, data)
        }

        let result = try await client.issues(owner: "org", repo: "app")
        XCTAssertEqual(result.issues.count, 1)
        XCTAssertEqual(result.issues[0].title, "Bug")
        XCTAssertTrue(result.fromCache)
    }

    // MARK: - Error Responses

    @MainActor
    func testUnauthorizedError() async throws {
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!
            let data = """
            {"error": "Invalid token"}
            """.data(using: .utf8)!
            return (response, data)
        }

        do {
            _ = try await client.health()
            XCTFail("Expected unauthorized error")
        } catch let error as APIError {
            if case .unauthorized = error {
                // Expected
            } else {
                XCTFail("Expected .unauthorized, got \(error)")
            }
        }
    }

    @MainActor
    func testNotFoundError() async throws {
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!
            let data = """
            {"error": "Repo not found"}
            """.data(using: .utf8)!
            return (response, data)
        }

        do {
            _ = try await client.repos()
            XCTFail("Expected server error")
        } catch let error as APIError {
            if case .serverError(let code, let message) = error {
                XCTAssertEqual(code, 404)
                XCTAssertEqual(message, "Repo not found")
            } else {
                XCTFail("Expected .serverError, got \(error)")
            }
        }
    }

    @MainActor
    func testInternalServerError() async throws {
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!
            let data = """
            {"error": "Internal server error"}
            """.data(using: .utf8)!
            return (response, data)
        }

        do {
            _ = try await client.repos()
            XCTFail("Expected server error")
        } catch let error as APIError {
            if case .serverError(let code, let message) = error {
                XCTAssertEqual(code, 500)
                XCTAssertEqual(message, "Internal server error")
            } else {
                XCTFail("Expected .serverError, got \(error)")
            }
        }
    }

    @MainActor
    func testServerErrorWithNoErrorBody() async throws {
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 503, httpVersion: nil, headerFields: nil)!
            // Non-JSON body
            let data = "Service Unavailable".data(using: .utf8)!
            return (response, data)
        }

        do {
            _ = try await client.health()
            XCTFail("Expected server error")
        } catch let error as APIError {
            if case .serverError(let code, let message) = error {
                XCTAssertEqual(code, 503)
                XCTAssertEqual(message, "Unknown error")
            } else {
                XCTFail("Expected .serverError, got \(error)")
            }
        }
    }

    // MARK: - APIError descriptions

    @MainActor
    func testAPIErrorDescriptions() {
        XCTAssertEqual(APIError.notConfigured.errorDescription, "Server URL not configured")
        XCTAssertEqual(APIError.unauthorized.errorDescription, "Invalid API token")
        XCTAssertEqual(APIError.invalidResponse.errorDescription, "Invalid server response")
        XCTAssertEqual(APIError.serverError(500, "boom").errorDescription, "Server error (500): boom")
    }

    // MARK: - POST with body

    @MainActor
    func testPostRequestIncludesBody() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.httpMethod, "POST")

            // Verify the body was sent
            if let bodyStream = request.httpBodyStream {
                bodyStream.open()
                var data = Data()
                let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 1024)
                while bodyStream.hasBytesAvailable {
                    let read = bodyStream.read(buffer, maxLength: 1024)
                    if read > 0 { data.append(buffer, count: read) }
                }
                buffer.deallocate()
                bodyStream.close()

                // Verify JSON body
                let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                XCTAssertNotNil(json)
                XCTAssertEqual(json?["agent"] as? String, "codex")
            }

            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let responseData = """
            {"success": true, "deployment_id": 1, "ttyd_port": 7682, "error": null, "label_warning": null}
            """.data(using: .utf8)!
            return (response, responseData)
        }

        let body = LaunchRequestBody(
            agent: .codex,
            branchName: "issue-5-fix",
            workspaceMode: .worktree,
            selectedCommentIndices: [0, 1],
            selectedFilePaths: ["src/main.ts"],
            preamble: "Fix the bug",
            forceResume: nil,
            idempotencyKey: nil
        )
        let bodyData = try JSONEncoder().encode(body)
        let (data, httpResponse) = try await client.request(path: "/api/v1/launch/org/repo/5", method: "POST", body: bodyData)
        XCTAssertEqual(httpResponse.statusCode, 200)

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let launchResponse = try decoder.decode(LaunchResponse.self, from: data)
        XCTAssertTrue(launchResponse.success)
        XCTAssertEqual(launchResponse.deploymentId, 1)
    }

    // MARK: - Base URL configuration

    @MainActor
    func testCustomServerURL() async throws {
        let customClient = TestableAPIClient(serverURL: "https://my-server.example.com:8080")

        MockURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.url!.host, "my-server.example.com")
            XCTAssertEqual(request.url!.port, 8080)
            XCTAssertEqual(request.url!.scheme, "https")

            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = """
            {"ok": true, "version": "1.0.0", "timestamp": "2026-04-27T00:00:00Z"}
            """.data(using: .utf8)!
            return (response, data)
        }

        let health = try await customClient.health()
        XCTAssertTrue(health.ok)
    }
}
