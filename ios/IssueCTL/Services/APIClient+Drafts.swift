import Foundation

// MARK: - Models for draft editing and label fetching

struct UpdateDraftRequestBody: Encodable, Sendable {
    let title: String?
    let body: String?
    let priority: Priority?
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
    func updateDraft(id: String, body: UpdateDraftRequestBody) async throws -> UpdateDraftResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/drafts/\(id)", method: "PATCH", body: bodyData)
        return try decoder.decode(UpdateDraftResponse.self, from: data)
    }

    func repoLabels(owner: String, repo: String) async throws -> [GitHubLabel] {
        let (data, _) = try await request(path: "/api/v1/repos/\(owner)/\(repo)/labels")
        let response = try decoder.decode(LabelsResponse.self, from: data)
        return response.labels
    }

    func assignDraftWithLabels(id: String, body: AssignDraftWithLabelsRequestBody) async throws -> AssignDraftResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/drafts/\(id)/assign", method: "POST", body: bodyData)
        return try decoder.decode(AssignDraftResponse.self, from: data)
    }
}
