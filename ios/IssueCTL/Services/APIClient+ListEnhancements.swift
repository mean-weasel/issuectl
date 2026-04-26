import Foundation

// MARK: - Response types for list enhancement endpoints

struct UserResponse: Codable, Sendable {
    let login: String
}

struct ParsedIssue: Codable, Identifiable, Sendable {
    let id: String
    let originalText: String
    let title: String
    let body: String
    let type: String
    let repoOwner: String?
    let repoName: String?
    let repoConfidence: Double
    let suggestedLabels: [String]
    let clarity: String
}

struct ParseResponse: Codable, Sendable {
    let parsed: ParsedIssuesData
}

struct ParsedIssuesData: Codable, Sendable {
    let issues: [ParsedIssue]
    let suggestedOrder: [String]
}

struct ParseRequestBody: Encodable, Sendable {
    let input: String
}

struct ReviewedIssue: Encodable, Sendable {
    let id: String
    let title: String
    let body: String
    let owner: String
    let repo: String
    let labels: [String]
    let accepted: Bool
}

struct BatchCreateRequestBody: Encodable, Sendable {
    let issues: [ReviewedIssue]
}

struct BatchCreateResult: Codable, Sendable {
    let created: Int
    let drafted: Int
    let failed: Int
    let results: [BatchCreateItemResult]
}

struct BatchCreateItemResult: Codable, Identifiable, Sendable {
    let id: String
    let success: Bool
    let issueNumber: Int?
    let draftId: String?
    let error: String?
    let owner: String
    let repo: String
}

// MARK: - APIClient extension for list enhancements

extension APIClient {

    /// Fetch the authenticated GitHub user login.
    func currentUser() async throws -> UserResponse {
        let (data, _) = try await requestData(path: "/api/v1/user")
        return try makeDecoder().decode(UserResponse.self, from: data)
    }

    /// Parse natural language text into structured issues via Claude.
    func parseNaturalLanguage(input: String) async throws -> ParsedIssuesData {
        let body = ParseRequestBody(input: input)
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await requestData(path: "/api/v1/parse", method: "POST", body: bodyData)
        return try makeDecoder().decode(ParseResponse.self, from: data).parsed
    }

    /// Batch create issues from reviewed/accepted parsed results.
    func batchCreateIssues(issues: [ReviewedIssue]) async throws -> BatchCreateResult {
        let body = BatchCreateRequestBody(issues: issues)
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await requestData(path: "/api/v1/parse/create", method: "POST", body: bodyData)
        return try makeDecoder().decode(BatchCreateResult.self, from: data)
    }

    // MARK: - Internal helpers

    /// Exposed wrapper around the private `request` method.
    /// Uses the same auth / error-handling logic as every other endpoint.
    private func requestData(path: String, method: String = "GET", body: Data? = nil) async throws -> (Data, HTTPURLResponse) {
        guard let base = URL(string: serverURL) else {
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
            let errorBody = try? JSONDecoder().decode(ErrorBody.self, from: data)
            throw APIError.serverError(httpResponse.statusCode, errorBody?.error ?? "Unknown error")
        }

        return (data, httpResponse)
    }

    private func makeDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }
}

/// Matches the shape of error responses from the server.
/// Named differently from the private `ErrorResponse` in APIClient.swift
/// to avoid collision.
private struct ErrorBody: Codable {
    let error: String
}
