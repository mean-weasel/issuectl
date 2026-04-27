import Foundation

// MARK: - Settings types

struct SettingsResponse: Codable, Sendable {
    let settings: [String: String]
}

struct SettingsUpdateRequest: Encodable, Sendable {
    let updates: [String: String]

    func encode(to encoder: Encoder) throws {
        // Encode as flat key-value (not nested under "updates")
        var container = encoder.singleValueContainer()
        try container.encode(updates)
    }
}

// MARK: - Worktree types

struct WorktreeInfo: Codable, Identifiable, Sendable {
    let path: String
    let name: String
    let repo: String?
    let owner: String?
    let localPath: String?
    let issueNumber: Int?
    let stale: Bool

    var id: String { path }
    var repoFullName: String? {
        guard let owner, let repo else { return nil }
        return "\(owner)/\(repo)"
    }
}

struct WorktreesResponse: Codable, Sendable {
    let worktrees: [WorktreeInfo]
}

struct WorktreeCleanupRequest: Encodable, Sendable {
    let path: String?
}

struct WorktreeCleanupResponse: Codable, Sendable {
    let success: Bool
    let removed: Int?
    let error: String?
}

// MARK: - Reassign types

struct ReassignRequest: Encodable, Sendable {
    let targetOwner: String
    let targetRepo: String
}

struct ReassignResponse: Codable, Sendable {
    let success: Bool
    let newIssueNumber: Int?
    let newOwner: String?
    let newRepo: String?
    let cleanupWarning: String?
    let error: String?
}

// MARK: - APIClient extensions

extension APIClient {

    // MARK: Settings

    func getSettings() async throws -> [String: String] {
        let (data, _) = try await request(path: "/api/v1/settings")
        let response = try decoder.decode(SettingsResponse.self, from: data)
        return response.settings
    }

    func updateSettings(_ updates: [String: String]) async throws -> SuccessResponse {
        let bodyData = try JSONEncoder().encode(updates)
        let (data, _) = try await request(path: "/api/v1/settings", method: "PATCH", body: bodyData)
        return try decoder.decode(SuccessResponse.self, from: data)
    }

    // MARK: Worktrees

    func listWorktrees() async throws -> [WorktreeInfo] {
        let (data, _) = try await request(path: "/api/v1/worktrees")
        let response = try decoder.decode(WorktreesResponse.self, from: data)
        return response.worktrees
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

    // MARK: Issue Reassignment

    func reassignIssue(
        owner: String, repo: String, number: Int,
        targetOwner: String, targetRepo: String
    ) async throws -> ReassignResponse {
        let body = ReassignRequest(targetOwner: targetOwner, targetRepo: targetRepo)
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(
            path: "/api/v1/issues/\(owner)/\(repo)/\(number)/reassign",
            method: "POST",
            body: bodyData
        )
        return try decoder.decode(ReassignResponse.self, from: data)
    }
}
