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

        var urlRequest = URLRequest(url: base.appendingPathComponent(path))
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
