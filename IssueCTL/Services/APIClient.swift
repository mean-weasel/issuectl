import Foundation

@Observable
final class APIClient: @unchecked Sendable {
    var serverURL: String {
        didSet { KeychainService.save(key: "serverURL", value: serverURL) }
    }
    var apiToken: String {
        didSet { KeychainService.save(key: "apiToken", value: apiToken) }
    }
    var isConfigured: Bool {
        !serverURL.isEmpty && !apiToken.isEmpty
    }

    init() {
        self.serverURL = KeychainService.load(key: "serverURL") ?? ""
        self.apiToken = KeychainService.load(key: "apiToken") ?? ""
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

    func repos() async throws -> [Repo] {
        let (data, _) = try await request(path: "/api/v1/repos")
        let response = try decoder.decode(ReposResponse.self, from: data)
        return response.repos
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
