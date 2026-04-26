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

// MARK: - APIClient Extension

extension APIClient {

    /// Fetch the current priority for an issue.
    func getPriority(owner: String, repo: String, number: Int) async throws -> Priority {
        let (data, _) = try await request(
            path: "/api/v1/issues/\(owner)/\(repo)/\(number)/priority"
        )
        return try decoder.decode(PriorityResponse.self, from: data).priority
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
