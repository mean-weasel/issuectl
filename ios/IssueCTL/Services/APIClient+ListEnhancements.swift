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
    private static let parseRequestTimeout: TimeInterval = 120

    /// Fetch the authenticated GitHub user login.
    func currentUser() async throws -> UserResponse {
        do {
            let (data, _) = try await request(path: "/api/v1/user")
            let response = try decoder.decode(UserResponse.self, from: data)
            offlineCache.save(response, for: "current-user", serverURL: serverURL)
            return response
        } catch {
            if let cached = offlineCache.load(UserResponse.self, for: "current-user", serverURL: serverURL) {
                return cached.value
            }
            throw error
        }
    }

    /// Parse natural language text into structured issues via Claude.
    func parseNaturalLanguage(input: String) async throws -> ParsedIssuesData {
        let body = ParseRequestBody(input: input)
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(
            path: "/api/v1/parse",
            method: "POST",
            body: bodyData,
            timeoutInterval: Self.parseRequestTimeout
        )
        return try decoder.decode(ParseResponse.self, from: data).parsed
    }

    /// Batch create issues from reviewed/accepted parsed results.
    func batchCreateIssues(issues: [ReviewedIssue]) async throws -> BatchCreateResult {
        let body = BatchCreateRequestBody(issues: issues)
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/parse/create", method: "POST", body: bodyData)
        return try decoder.decode(BatchCreateResult.self, from: data)
    }
}
