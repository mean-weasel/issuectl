import Foundation

// MARK: - Request/Response types for Settings endpoints

struct AddRepoRequest: Encodable, Sendable {
    let owner: String
    let name: String
}

struct AddRepoResponse: Codable, Sendable {
    let success: Bool
    let repo: Repo?
    let error: String?
}

struct RemoveRepoResponse: Codable, Sendable {
    let success: Bool
    let error: String?
}

// MARK: - APIClient Settings extension

extension APIClient {

    /// Add a new tracked repository.
    func addRepo(owner: String, name: String) async throws -> Repo {
        let body = AddRepoRequest(owner: owner, name: name)
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/repos", method: "POST", body: bodyData)
        let response = try decoder.decode(AddRepoResponse.self, from: data)
        guard response.success, let repo = response.repo else {
            throw APIError.serverError(400, response.error ?? "Failed to add repository")
        }
        return repo
    }

    /// Remove a tracked repository by ID.
    func removeRepo(id: Int) async throws {
        let (data, _) = try await request(path: "/api/v1/repos/\(id)", method: "DELETE", body: nil)
        let response = try decoder.decode(RemoveRepoResponse.self, from: data)
        guard response.success else {
            throw APIError.serverError(400, response.error ?? "Failed to remove repository")
        }
    }
}
