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

struct UpdateRepoRequest: Encodable, Sendable {
    let localPath: String?
    let branchPattern: String?
}

struct UpdateRepoResponse: Codable, Sendable {
    let success: Bool
    let repo: Repo?
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

    /// Remove a tracked repository by owner and name.
    func removeRepo(owner: String, name: String) async throws {
        let (data, _) = try await request(path: "/api/v1/repos/\(owner)/\(name)", method: "DELETE", body: nil)
        let response = try decoder.decode(RemoveRepoResponse.self, from: data)
        guard response.success else {
            throw APIError.serverError(400, response.error ?? "Failed to remove repository")
        }
    }

    /// Fetch accessible GitHub repos (cached or refreshed).
    func githubRepos(refresh: Bool = false) async throws -> GitHubAccessibleReposResponse {
        var path = "/api/v1/repos/github"
        if refresh { path += "?refresh=true" }
        let (data, _) = try await request(path: path)
        return try decoder.decode(GitHubAccessibleReposResponse.self, from: data)
    }

    /// Update a tracked repository's localPath and/or branchPattern.
    func updateRepo(owner: String, name: String, localPath: String?, branchPattern: String?) async throws -> Repo {
        let body = UpdateRepoRequest(localPath: localPath, branchPattern: branchPattern)
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/repos/\(owner)/\(name)", method: "PATCH", body: bodyData)
        let response = try decoder.decode(UpdateRepoResponse.self, from: data)
        guard response.success, let repo = response.repo else {
            throw APIError.serverError(400, response.error ?? "Failed to update repository")
        }
        return repo
    }
}
