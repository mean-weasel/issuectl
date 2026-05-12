import Foundation

// MARK: - Request/Response Types for Assignment

struct CollaboratorInfo: Codable, Identifiable, Sendable {
    let login: String
    let avatarUrl: String

    var id: String { login }
}

struct CollaboratorsResponse: Codable, Sendable {
    let collaborators: [CollaboratorInfo]
}

struct AssigneesUpdateResponse: Codable, Sendable {
    let assignees: [String]
}

// MARK: - APIClient Extension

extension APIClient {

    /// Fetch collaborators for a repository (possible assignees).
    func collaborators(owner: String, repo: String) async throws -> [CollaboratorInfo] {
        let (data, _) = try await request(path: "/api/v1/repos/\(owner)/\(repo)/collaborators")
        return try decoder.decode(CollaboratorsResponse.self, from: data).collaborators
    }

    /// Update the assignees on an issue. Sends the full desired list; the server computes the diff.
    func updateAssignees(owner: String, repo: String, number: Int, assignees: [String]) async throws -> [String] {
        let body = try JSONEncoder().encode(["assignees": assignees])
        let (data, _) = try await request(
            path: "/api/v1/issues/\(owner)/\(repo)/\(number)/assignees",
            method: "PUT",
            body: body
        )
        return try decoder.decode(AssigneesUpdateResponse.self, from: data).assignees
    }
}
