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
        let (data, _) = try await settingsRequest(path: "/api/v1/repos", method: "POST", body: bodyData)
        let response = try settingsDecoder.decode(AddRepoResponse.self, from: data)
        guard response.success, let repo = response.repo else {
            throw APIError.serverError(400, response.error ?? "Failed to add repository")
        }
        return repo
    }

    /// Remove a tracked repository by ID.
    func removeRepo(id: Int) async throws {
        let (data, _) = try await settingsRequest(path: "/api/v1/repos/\(id)", method: "DELETE", body: nil)
        let response = try settingsDecoder.decode(RemoveRepoResponse.self, from: data)
        guard response.success else {
            throw APIError.serverError(400, response.error ?? "Failed to remove repository")
        }
    }

    // MARK: - Private helpers

    /// Standalone request helper for the Settings extension.
    /// Duplicates the core request logic since APIClient.request is private.
    private func settingsRequest(path: String, method: String, body: Data?) async throws -> (Data, HTTPURLResponse) {
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
            let errorBody = try? JSONDecoder().decode(SettingsErrorResponse.self, from: data)
            throw APIError.serverError(httpResponse.statusCode, errorBody?.error ?? "Unknown error")
        }

        return (data, httpResponse)
    }

    private var settingsDecoder: JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }
}

/// Private error response decoder for Settings extension.
private struct SettingsErrorResponse: Codable {
    let error: String
}
