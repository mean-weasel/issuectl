import Foundation

// MARK: - Request/Response Types for Detail Actions

struct UpdateIssueRequestBody: Encodable, Sendable {
    let title: String?
    let body: String?
}

struct UpdateIssueResponse: Codable, Sendable {
    let success: Bool
    let error: String?
}

struct EditCommentRequestBody: Encodable, Sendable {
    let commentId: Int
    let body: String
}

struct EditCommentResponse: Codable, Sendable {
    let success: Bool
    let error: String?
}

struct DeleteCommentRequestBody: Encodable, Sendable {
    let commentId: Int
}

struct DeleteCommentResponse: Codable, Sendable {
    let success: Bool
    let error: String?
}

struct ToggleLabelRequestBody: Encodable, Sendable {
    let label: String
    let action: String // "add" or "remove"
}

struct ToggleLabelResponse: Codable, Sendable {
    let success: Bool
    let error: String?
}

struct LabelsListResponse: Codable, Sendable {
    let labels: [GitHubLabel]
}

// MARK: - APIClient Extension

extension APIClient {
    /// Internal request helper — mirrors the private `request` method on APIClient.
    /// Needed because `private` scope is file-limited in Swift and this file
    /// cannot call the original. Uses the publicly-readable `serverURL` and
    /// `apiToken` properties.
    func requestData(path: String, method: String = "GET", body: Data? = nil) async throws -> (Data, HTTPURLResponse) {
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
            let errorBody = try? JSONDecoder().decode(DetailActionErrorResponse.self, from: data)
            throw APIError.serverError(httpResponse.statusCode, errorBody?.error ?? "Unknown error")
        }

        return (data, httpResponse)
    }

    func makeDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }

    // MARK: - Issue Editing (#263)

    func updateIssue(
        owner: String, repo: String, number: Int,
        body: UpdateIssueRequestBody
    ) async throws -> UpdateIssueResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await requestData(
            path: "/api/v1/issues/\(owner)/\(repo)/\(number)",
            method: "PATCH",
            body: bodyData
        )
        return try makeDecoder().decode(UpdateIssueResponse.self, from: data)
    }

    // MARK: - Comment Edit & Delete (#265)

    func editComment(
        owner: String, repo: String, number: Int,
        body: EditCommentRequestBody
    ) async throws -> EditCommentResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await requestData(
            path: "/api/v1/issues/\(owner)/\(repo)/\(number)/comments",
            method: "PATCH",
            body: bodyData
        )
        return try makeDecoder().decode(EditCommentResponse.self, from: data)
    }

    func deleteComment(
        owner: String, repo: String, number: Int,
        body: DeleteCommentRequestBody
    ) async throws -> DeleteCommentResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await requestData(
            path: "/api/v1/issues/\(owner)/\(repo)/\(number)/comments",
            method: "DELETE",
            body: bodyData
        )
        return try makeDecoder().decode(DeleteCommentResponse.self, from: data)
    }

    // MARK: - Label Management (#264)

    func listRepoLabels(owner: String, repo: String) async throws -> LabelsListResponse {
        let (data, _) = try await requestData(
            path: "/api/v1/repos/\(owner)/\(repo)/labels",
            method: "GET",
            body: nil
        )
        return try makeDecoder().decode(LabelsListResponse.self, from: data)
    }

    func toggleLabel(
        owner: String, repo: String, number: Int,
        body: ToggleLabelRequestBody
    ) async throws -> ToggleLabelResponse {
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await requestData(
            path: "/api/v1/issues/\(owner)/\(repo)/\(number)/labels",
            method: "POST",
            body: bodyData
        )
        return try makeDecoder().decode(ToggleLabelResponse.self, from: data)
    }
}

private struct DetailActionErrorResponse: Codable {
    let error: String
}
