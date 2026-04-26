import Foundation

// MARK: - Models for draft editing and label fetching

struct UpdateDraftRequestBody: Encodable, Sendable {
    let title: String?
    let body: String?
    let priority: String?
}

struct UpdateDraftResponse: Codable, Sendable {
    let success: Bool
    let draft: Draft?
    let error: String?
}

struct LabelsResponse: Codable, Sendable {
    let labels: [GitHubLabel]
}

struct AssignDraftWithLabelsRequestBody: Encodable, Sendable {
    let repoId: Int
    let labels: [String]?
}

// MARK: - APIClient extension for draft editing and labels

extension APIClient {
    /// Internal helper that mirrors the private `request` method in APIClient.
    /// Needed because Swift extensions in separate files cannot access private members.
    func extensionRequest(path: String, method: String = "GET", body: Data? = nil) async throws -> (Data, HTTPURLResponse) {
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
            let errorBody = try? JSONDecoder().decode(ExtensionErrorResponse.self, from: data)
            throw APIError.serverError(httpResponse.statusCode, errorBody?.error ?? "Unknown error")
        }

        return (data, httpResponse)
    }

    private static let extensionDecoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    func updateDraft(id: String, body: UpdateDraftRequestBody) async throws -> UpdateDraftResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await extensionRequest(path: "/api/v1/drafts/\(id)", method: "PATCH", body: bodyData)
        return try Self.extensionDecoder.decode(UpdateDraftResponse.self, from: data)
    }

    func repoLabels(owner: String, repo: String) async throws -> [GitHubLabel] {
        let (data, _) = try await extensionRequest(path: "/api/v1/repos/\(owner)/\(repo)/labels")
        let response = try Self.extensionDecoder.decode(LabelsResponse.self, from: data)
        return response.labels
    }

    func assignDraftWithLabels(id: String, body: AssignDraftWithLabelsRequestBody) async throws -> AssignDraftResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await extensionRequest(path: "/api/v1/drafts/\(id)/assign", method: "POST", body: bodyData)
        return try Self.extensionDecoder.decode(AssignDraftResponse.self, from: data)
    }
}

private struct ExtensionErrorResponse: Codable {
    let error: String
}
