import Foundation

@Observable @MainActor
final class APIClient {
    private(set) var serverURL: String = ""
    private(set) var apiToken: String = ""
    let offlineCache = OfflineCacheStore()
    var isConfigured: Bool {
        !serverURL.isEmpty && !apiToken.isEmpty
    }

    init() {
        // Support environment variables for automated testing:
        // ISSUECTL_SERVER_URL=http://... ISSUECTL_API_TOKEN=abc123
        let env = ProcessInfo.processInfo.environment
        let isTesting = env["ISSUECTL_UI_TESTING"] == "1"
        if let url = env["ISSUECTL_SERVER_URL"], !url.isEmpty {
            self.serverURL = url
            if !isTesting { try? KeychainService.save(key: "serverURL", value: url) }
        } else {
            self.serverURL = KeychainService.load(key: "serverURL") ?? ""
        }
        if let token = env["ISSUECTL_API_TOKEN"], !token.isEmpty {
            self.apiToken = token
            if !isTesting { try? KeychainService.save(key: "apiToken", value: token) }
        } else {
            self.apiToken = KeychainService.load(key: "apiToken") ?? ""
        }
    }

    /// Persist credentials after a successful health check.
    func configure(url: String, token: String) throws {
        serverURL = url
        apiToken = token
        try KeychainService.save(key: "serverURL", value: url)
        try KeychainService.save(key: "apiToken", value: token)
    }

    /// Clear credentials and remove from Keychain.
    func disconnect() {
        serverURL = ""
        apiToken = ""
        KeychainService.delete(key: "serverURL")
        KeychainService.delete(key: "apiToken")
    }

    private var baseURL: URL? {
        URL(string: serverURL)
    }

    func request(path: String, method: String = "GET", body: Data? = nil) async throws -> (Data, HTTPURLResponse) {
        guard let base = baseURL else {
            throw APIError.notConfigured
        }

        guard let url = URL(string: path, relativeTo: base) else {
            throw APIError.invalidPath(path)
        }
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = method
        urlRequest.setValue("Bearer \(apiToken)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { urlRequest.httpBody = body }

        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }
        if httpResponse.statusCode >= 400 {
            let errorBody = try? JSONDecoder().decode(ErrorResponse.self, from: data)
            throw APIError.serverError(httpResponse.statusCode, errorBody?.error ?? "Unknown error")
        }

        return (data, httpResponse)
    }

    // MARK: - Endpoints

    func health() async throws -> ServerHealth {
        let (data, _) = try await request(path: "/api/v1/health")
        return try decoder.decode(ServerHealth.self, from: data)
    }

    /// Check health against a server before persisting credentials.
    func checkHealth(url: String, token: String) async throws -> ServerHealth {
        guard let base = URL(string: url) else {
            throw APIError.notConfigured
        }
        guard let healthURL = URL(string: "/api/v1/health", relativeTo: base) else {
            throw APIError.invalidPath("/api/v1/health")
        }
        var urlRequest = URLRequest(url: healthURL)
        urlRequest.httpMethod = "GET"
        urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        if httpResponse.statusCode == 401 { throw APIError.unauthorized }
        if httpResponse.statusCode >= 400 {
            let errorBody = try? JSONDecoder().decode(ErrorResponse.self, from: data)
            throw APIError.serverError(httpResponse.statusCode, errorBody?.error ?? "Unknown error")
        }
        return try decoder.decode(ServerHealth.self, from: data)
    }

    func repos() async throws -> [Repo] {
        do {
            let (data, _) = try await request(path: "/api/v1/repos")
            let response = try decoder.decode(ReposResponse.self, from: data)
            offlineCache.save(response.repos, for: "repos", serverURL: serverURL)
            return response.repos
        } catch {
            if let cached = offlineCache.load([Repo].self, for: "repos", serverURL: serverURL) {
                return cached.value
            }
            throw error
        }
    }

    func issues(owner: String, repo: String, refresh: Bool = false) async throws -> IssuesResponse {
        var path = "/api/v1/issues/\(owner)/\(repo)"
        if refresh { path += "?refresh=true" }
        let cacheKey = "issues.\(owner).\(repo)"
        do {
            let (data, _) = try await request(path: path)
            let response = try decoder.decode(IssuesResponse.self, from: data)
            offlineCache.save(response.issues, for: cacheKey, serverURL: serverURL, cachedAt: response.cachedAt)
            return response
        } catch {
            if let cached = offlineCache.load([GitHubIssue].self, for: cacheKey, serverURL: serverURL) {
                return IssuesResponse(issues: cached.value, fromCache: true, cachedAt: cached.cachedAt)
            }
            throw error
        }
    }

    func issueDetail(owner: String, repo: String, number: Int, refresh: Bool = false) async throws -> IssueDetailResponse {
        var path = "/api/v1/issues/\(owner)/\(repo)/\(number)"
        if refresh { path += "?refresh=true" }
        let cacheKey = "issue-detail.\(owner).\(repo).\(number)"
        do {
            let (data, _) = try await request(path: path)
            let response = try decoder.decode(IssueDetailResponse.self, from: data)
            offlineCache.save(response, for: cacheKey, serverURL: serverURL)
            return response
        } catch {
            if let cached = offlineCache.load(IssueDetailResponse.self, for: cacheKey, serverURL: serverURL) {
                return cached.value
            }
            throw error
        }
    }

    func pulls(owner: String, repo: String, refresh: Bool = false) async throws -> PullsResponse {
        var path = "/api/v1/pulls/\(owner)/\(repo)"
        if refresh { path += "?refresh=true" }
        let cacheKey = "pulls.\(owner).\(repo)"
        do {
            let (data, _) = try await request(path: path)
            let response = try decoder.decode(PullsResponse.self, from: data)
            offlineCache.save(response.pulls, for: cacheKey, serverURL: serverURL, cachedAt: response.cachedAt)
            return response
        } catch {
            if let cached = offlineCache.load([GitHubPull].self, for: cacheKey, serverURL: serverURL) {
                return PullsResponse(pulls: cached.value, fromCache: true, cachedAt: cached.cachedAt)
            }
            throw error
        }
    }

    func pullDetail(owner: String, repo: String, number: Int, refresh: Bool = false) async throws -> PullDetailResponse {
        var path = "/api/v1/pulls/\(owner)/\(repo)/\(number)"
        if refresh { path += "?refresh=true" }
        let cacheKey = "pull-detail.\(owner).\(repo).\(number)"
        do {
            let (data, _) = try await request(path: path)
            let response = try decoder.decode(PullDetailResponse.self, from: data)
            offlineCache.save(response, for: cacheKey, serverURL: serverURL, cachedAt: response.cachedAt)
            return response
        } catch {
            if let cached = offlineCache.load(PullDetailResponse.self, for: cacheKey, serverURL: serverURL) {
                return cached.value
            }
            throw error
        }
    }

    func activeDeployments() async throws -> ActiveDeploymentsResponse {
        do {
            let (data, _) = try await request(path: "/api/v1/deployments")
            let response = try decoder.decode(ActiveDeploymentsResponse.self, from: data)
            offlineCache.save(response, for: "deployments", serverURL: serverURL)
            return response
        } catch {
            if let cached = offlineCache.load(ActiveDeploymentsResponse.self, for: "deployments", serverURL: serverURL) {
                return cached.value
            }
            throw error
        }
    }

    func launch(owner: String, repo: String, number: Int, body: LaunchRequestBody) async throws -> LaunchResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/launch/\(owner)/\(repo)/\(number)", method: "POST", body: bodyData)
        return try decoder.decode(LaunchResponse.self, from: data)
    }

    func endSession(deploymentId: Int, owner: String, repo: String, issueNumber: Int) async throws -> EndSessionResponse {
        let body = EndSessionRequestBody(owner: owner, repo: repo, issueNumber: issueNumber)
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/deployments/\(deploymentId)/end", method: "POST", body: bodyData)
        return try decoder.decode(EndSessionResponse.self, from: data)
    }

    func mergePull(owner: String, repo: String, number: Int, body: MergeRequestBody) async throws -> MergeResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/pulls/\(owner)/\(repo)/\(number)/merge", method: "POST", body: bodyData)
        return try decoder.decode(MergeResponse.self, from: data)
    }

    func reviewPull(owner: String, repo: String, number: Int, body: ReviewRequestBody) async throws -> ReviewResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/pulls/\(owner)/\(repo)/\(number)/review", method: "POST", body: bodyData)
        return try decoder.decode(ReviewResponse.self, from: data)
    }

    func commentOnPull(owner: String, repo: String, number: Int, body: PullCommentRequestBody) async throws -> PullCommentResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/pulls/\(owner)/\(repo)/\(number)/comments", method: "POST", body: bodyData)
        return try decoder.decode(PullCommentResponse.self, from: data)
    }

    func updateIssueState(owner: String, repo: String, number: Int, body: IssueStateRequestBody) async throws -> IssueStateResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/issues/\(owner)/\(repo)/\(number)/state", method: "POST", body: bodyData)
        return try decoder.decode(IssueStateResponse.self, from: data)
    }

    func commentOnIssue(owner: String, repo: String, number: Int, body: IssueCommentRequestBody) async throws -> IssueCommentResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/issues/\(owner)/\(repo)/\(number)/comments", method: "POST", body: bodyData)
        return try decoder.decode(IssueCommentResponse.self, from: data)
    }

    // MARK: - Drafts

    func listDrafts() async throws -> DraftsResponse {
        do {
            let (data, _) = try await request(path: "/api/v1/drafts")
            let response = try decoder.decode(DraftsResponse.self, from: data)
            offlineCache.save(response, for: "drafts", serverURL: serverURL)
            return response
        } catch {
            if let cached = offlineCache.load(DraftsResponse.self, for: "drafts", serverURL: serverURL) {
                return cached.value
            }
            throw error
        }
    }

    func createDraft(body: CreateDraftRequestBody) async throws -> CreateDraftResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/drafts", method: "POST", body: bodyData)
        return try decoder.decode(CreateDraftResponse.self, from: data)
    }

    func deleteDraft(id: String) async throws -> SuccessResponse {
        let (data, _) = try await request(path: "/api/v1/drafts/\(id)", method: "DELETE")
        return try decoder.decode(SuccessResponse.self, from: data)
    }

    func assignDraft(id: String, body: AssignDraftRequestBody) async throws -> AssignDraftResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/drafts/\(id)/assign", method: "POST", body: bodyData)
        return try decoder.decode(AssignDraftResponse.self, from: data)
    }

    // MARK: - Private

    let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()
}

enum APIError: LocalizedError {
    case notConfigured
    case invalidPath(String)
    case unauthorized
    case invalidResponse
    case serverError(Int, String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: "Server URL not configured"
        case .invalidPath(let path): "Invalid API path: \(path)"
        case .unauthorized: "Invalid API token"
        case .invalidResponse: "Invalid server response"
        case .serverError(let code, let message): "Server error (\(code)): \(message)"
        }
    }
}

private struct ErrorResponse: Codable {
    let error: String
}
