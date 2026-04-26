import Foundation

// MARK: - Priority Model

enum Priority: String, Codable, CaseIterable, Sendable {
    case low
    case normal
    case high

    var sortIndex: Int {
        switch self {
        case .high: 0
        case .normal: 1
        case .low: 2
        }
    }
}

// MARK: - Request/Response Types

struct PriorityResponse: Codable, Sendable {
    let priority: Priority
}

struct SetPriorityRequestBody: Encodable, Sendable {
    let priority: String
}

struct SetPriorityResponse: Codable, Sendable {
    let success: Bool
    let error: String?
}

struct IssuePriorityItem: Codable, Sendable {
    let repoId: Int
    let issueNumber: Int
    let priority: Priority
    let updatedAt: Int
}

struct PrioritiesListResponse: Codable, Sendable {
    let priorities: [IssuePriorityItem]
}

// MARK: - APIClient Extension

extension APIClient {

    /// Fetch the current priority for an issue.
    func getPriority(owner: String, repo: String, number: Int) async throws -> Priority {
        let (data, _) = try await request(
            path: "/api/v1/issues/\(owner)/\(repo)/\(number)/priority"
        )
        return try decoder.decode(PriorityResponse.self, from: data).priority
    }

    /// Fetch all priorities for a repo in one call.
    func listPriorities(owner: String, repo: String) async throws -> [IssuePriorityItem] {
        let (data, _) = try await request(
            path: "/api/v1/issues/\(owner)/\(repo)/priorities"
        )
        return try decoder.decode(PrioritiesListResponse.self, from: data).priorities
    }

    /// Set the priority for an issue.
    func setPriority(owner: String, repo: String, number: Int, priority: Priority) async throws -> SetPriorityResponse {
        let body = SetPriorityRequestBody(priority: priority.rawValue)
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(
            path: "/api/v1/issues/\(owner)/\(repo)/\(number)/priority",
            method: "PUT",
            body: bodyData
        )
        return try decoder.decode(SetPriorityResponse.self, from: data)
    }
}
