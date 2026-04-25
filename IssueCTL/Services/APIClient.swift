import Foundation

@Observable @MainActor
final class APIClient {
    private(set) var serverURL: String = ""
    private(set) var apiToken: String = ""
    var isConfigured: Bool {
        !serverURL.isEmpty && !apiToken.isEmpty
    }

    init() {
        // Support launch arguments for automated testing:
        // -serverURL http://... -apiToken abc123
        let args = ProcessInfo.processInfo.arguments
        if let urlIndex = args.firstIndex(of: "-serverURL"),
           urlIndex + 1 < args.count {
            let url = args[urlIndex + 1]
            self.serverURL = url
            KeychainService.save(key: "serverURL", value: url)
        } else {
            self.serverURL = KeychainService.load(key: "serverURL") ?? ""
        }
        if let tokenIndex = args.firstIndex(of: "-apiToken"),
           tokenIndex + 1 < args.count {
            let token = args[tokenIndex + 1]
            self.apiToken = token
            KeychainService.save(key: "apiToken", value: token)
        } else {
            self.apiToken = KeychainService.load(key: "apiToken") ?? ""
        }
    }

    /// Persist credentials after a successful health check.
    func configure(url: String, token: String) {
        serverURL = url
        apiToken = token
        KeychainService.save(key: "serverURL", value: url)
        KeychainService.save(key: "apiToken", value: token)
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

    private func request(path: String, method: String = "GET", body: Data? = nil) async throws -> (Data, HTTPURLResponse) {
        guard let base = baseURL else {
            throw APIError.notConfigured
        }

        var urlRequest = URLRequest(url: base.appendingPathComponent(path))
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
        var urlRequest = URLRequest(url: base.appendingPathComponent("/api/v1/health"))
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
        let (data, _) = try await request(path: "/api/v1/repos")
        let response = try decoder.decode(ReposResponse.self, from: data)
        return response.repos
    }

    func issues(owner: String, repo: String, refresh: Bool = false) async throws -> IssuesResponse {
        var path = "/api/v1/issues/\(owner)/\(repo)"
        if refresh { path += "?refresh=true" }
        let (data, _) = try await request(path: path)
        return try decoder.decode(IssuesResponse.self, from: data)
    }

    func issueDetail(owner: String, repo: String, number: Int, refresh: Bool = false) async throws -> IssueDetailResponse {
        var path = "/api/v1/issues/\(owner)/\(repo)/\(number)"
        if refresh { path += "?refresh=true" }
        let (data, _) = try await request(path: path)
        return try decoder.decode(IssueDetailResponse.self, from: data)
    }

    func pulls(owner: String, repo: String, refresh: Bool = false) async throws -> PullsResponse {
        var path = "/api/v1/pulls/\(owner)/\(repo)"
        if refresh { path += "?refresh=true" }
        let (data, _) = try await request(path: path)
        return try decoder.decode(PullsResponse.self, from: data)
    }

    func pullDetail(owner: String, repo: String, number: Int, refresh: Bool = false) async throws -> PullDetailResponse {
        var path = "/api/v1/pulls/\(owner)/\(repo)/\(number)"
        if refresh { path += "?refresh=true" }
        let (data, _) = try await request(path: path)
        return try decoder.decode(PullDetailResponse.self, from: data)
    }

    // MARK: - Private

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()
}

enum APIError: LocalizedError {
    case notConfigured
    case unauthorized
    case invalidResponse
    case serverError(Int, String)

    var errorDescription: String? {
        switch self {
        case .notConfigured: "Server URL not configured"
        case .unauthorized: "Invalid API token"
        case .invalidResponse: "Invalid server response"
        case .serverError(let code, let message): "Server error (\(code)): \(message)"
        }
    }
}

private struct ErrorResponse: Codable {
    let error: String
}
