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
    func currentUser(refresh: Bool = false, maxAge: TimeInterval = 300) async throws -> UserResponse {
        let now = Date()
        if !refresh,
           let cachedCurrentUser,
           let cachedCurrentUserExpiresAt,
           now < cachedCurrentUserExpiresAt {
            return cachedCurrentUser
        }

        if !refresh, let currentUserTask {
            return try await currentUserTask.value
        }

        let task = Task { @MainActor in
            let (data, _) = try await request(path: "/api/v1/user")
            return try decoder.decode(UserResponse.self, from: data)
        }
        currentUserTask = task

        do {
            let user = try await task.value
            cachedCurrentUser = user
            cachedCurrentUserExpiresAt = Date().addingTimeInterval(maxAge)
            currentUserTask = nil
            return user
        } catch {
            currentUserTask = nil
            throw error
        }
    }

    /// Parse natural language text into structured issues via Claude.
    func parseNaturalLanguage(input: String) async throws -> ParsedIssuesData {
        let body = ParseRequestBody(input: input)
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/parse", method: "POST", body: bodyData)
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
