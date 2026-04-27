import Foundation

// MARK: - Settings types

struct SettingsResponse: Codable, Sendable {
    let settings: [String: String]
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

// MARK: - Worktree status types

struct WorktreeStatusResponse: Codable, Sendable {
    let exists: Bool
    let dirty: Bool
    let path: String

    var isDirty: Bool { exists && dirty }
}

struct WorktreeResetRequest: Encodable, Sendable {
    let owner: String
    let repo: String
    let issueNumber: Int
}

// MARK: - EnsureTtyd types

enum EnsureTtydResult: Sendable {
    case available(port: Int, respawned: Bool)
    case unavailable(error: String?)
}

extension EnsureTtydResult: Decodable {
    private enum CodingKeys: String, CodingKey {
        case port, respawned, alive, error
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let port = try c.decodeIfPresent(Int.self, forKey: .port) {
            let respawned = try c.decodeIfPresent(Bool.self, forKey: .respawned) ?? false
            self = .available(port: port, respawned: respawned)
        } else {
            let error = try c.decodeIfPresent(String.self, forKey: .error)
            self = .unavailable(error: error)
        }
    }
}

// MARK: - APIClient extensions

extension APIClient {

    // MARK: Worktree Status

    func checkWorktreeStatus(owner: String, repo: String, issueNumber: Int) async throws -> WorktreeStatusResponse {
        let (data, _) = try await request(
            path: "/api/v1/worktrees/status?owner=\(owner)&repo=\(repo)&issueNumber=\(issueNumber)"
        )
        return try decoder.decode(WorktreeStatusResponse.self, from: data)
    }

    func resetWorktree(owner: String, repo: String, issueNumber: Int) async throws -> SuccessResponse {
        let body = WorktreeResetRequest(owner: owner, repo: repo, issueNumber: issueNumber)
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/worktrees/reset", method: "POST", body: bodyData)
        return try decoder.decode(SuccessResponse.self, from: data)
    }

    // MARK: EnsureTtyd

    func ensureTtyd(deploymentId: Int) async throws -> EnsureTtydResult {
        let (data, _) = try await request(
            path: "/api/v1/deployments/\(deploymentId)/ensure-ttyd",
            method: "POST"
        )
        return try decoder.decode(EnsureTtydResult.self, from: data)
    }

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
