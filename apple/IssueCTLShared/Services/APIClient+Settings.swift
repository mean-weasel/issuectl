import Foundation

// MARK: - Request/Response types for Settings endpoints

struct AddRepoRequest: Encodable, Sendable {
    let owner: String
    let name: String
    let autoLaunchIssues: Bool?
    let autoReviewPrs: Bool?
    let issueAgent: LaunchAgent?
    let reviewAgent: LaunchAgent?
    let reviewPreamble: String?
    let webhookPayloadMode: WebhookPayloadMode?
    let installWebhook: Bool?

    init(
        owner: String,
        name: String,
        autoLaunchIssues: Bool? = nil,
        autoReviewPrs: Bool? = nil,
        issueAgent: LaunchAgent? = nil,
        reviewAgent: LaunchAgent? = nil,
        reviewPreamble: String? = nil,
        webhookPayloadMode: WebhookPayloadMode? = nil,
        installWebhook: Bool? = nil
    ) {
        self.owner = owner
        self.name = name
        self.autoLaunchIssues = autoLaunchIssues
        self.autoReviewPrs = autoReviewPrs
        self.issueAgent = issueAgent
        self.reviewAgent = reviewAgent
        self.reviewPreamble = reviewPreamble
        self.webhookPayloadMode = webhookPayloadMode
        self.installWebhook = installWebhook
    }
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
    let autoLaunchIssues: Bool?
    let autoReviewPrs: Bool?
    let issueAgent: LaunchAgent?
    let reviewAgent: LaunchAgent?
    let reviewPreamble: String?
    let webhookPayloadMode: WebhookPayloadMode?

    init(
        localPath: String? = nil,
        branchPattern: String? = nil,
        autoLaunchIssues: Bool? = nil,
        autoReviewPrs: Bool? = nil,
        issueAgent: LaunchAgent? = nil,
        reviewAgent: LaunchAgent? = nil,
        reviewPreamble: String? = nil,
        webhookPayloadMode: WebhookPayloadMode? = nil
    ) {
        self.localPath = localPath
        self.branchPattern = branchPattern
        self.autoLaunchIssues = autoLaunchIssues
        self.autoReviewPrs = autoReviewPrs
        self.issueAgent = issueAgent
        self.reviewAgent = reviewAgent
        self.reviewPreamble = reviewPreamble
        self.webhookPayloadMode = webhookPayloadMode
    }
}

struct UpdateRepoResponse: Codable, Sendable {
    let success: Bool
    let repo: Repo?
    let error: String?
}

struct RepoLabelsRecreateResponse: Codable, Sendable {
    let success: Bool
    let error: String?
}

struct RecreateRepoLabelsRequest: Encodable, Sendable {
    let action = "recreate"
}

enum WebhookAction: String, Encodable, Sendable {
    case create
    case rotate
    case reinstall
    case ping
}

struct WebhookActionRequest: Encodable, Sendable {
    let action: WebhookAction
}

// MARK: - APIClient Settings extension

extension APIClient {

    /// Add a new tracked repository.
    func addRepo(
        owner: String,
        name: String,
        autoLaunchIssues: Bool? = nil,
        autoReviewPrs: Bool? = nil,
        issueAgent: LaunchAgent? = nil,
        reviewAgent: LaunchAgent? = nil,
        reviewPreamble: String? = nil,
        webhookPayloadMode: WebhookPayloadMode? = nil,
        installWebhook: Bool? = nil
    ) async throws -> Repo {
        let body = AddRepoRequest(
            owner: owner,
            name: name,
            autoLaunchIssues: autoLaunchIssues,
            autoReviewPrs: autoReviewPrs,
            issueAgent: issueAgent,
            reviewAgent: reviewAgent,
            reviewPreamble: reviewPreamble,
            webhookPayloadMode: webhookPayloadMode,
            installWebhook: installWebhook
        )
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/repos", method: "POST", body: bodyData)
        let response = try decoder.decode(AddRepoResponse.self, from: data)
        guard response.success, let repo = response.repo else {
            throw APIError.serverError(400, response.error ?? "Failed to add repository")
        }
        clearReposCache()
        clearWorkbenchCache()
        return repo
    }

    /// Remove a tracked repository by owner and name.
    func removeRepo(owner: String, name: String) async throws {
        let (data, _) = try await request(path: "/api/v1/repos/\(owner)/\(name)", method: "DELETE", body: nil)
        let response = try decoder.decode(RemoveRepoResponse.self, from: data)
        guard response.success else {
            throw APIError.serverError(400, response.error ?? "Failed to remove repository")
        }
        clearReposCache()
        clearWorkbenchCache()
    }

    /// Fetch accessible GitHub repos (cached or refreshed).
    func githubRepos(refresh: Bool = false) async throws -> GitHubAccessibleReposResponse {
        var path = "/api/v1/repos/github"
        if refresh { path += "?refresh=true" }
        let (data, _) = try await request(path: path)
        return try decoder.decode(GitHubAccessibleReposResponse.self, from: data)
    }

    /// Update a tracked repository's localPath and/or branchPattern.
    func updateRepo(
        owner: String,
        name: String,
        localPath: String? = nil,
        branchPattern: String? = nil,
        autoLaunchIssues: Bool? = nil,
        autoReviewPrs: Bool? = nil,
        issueAgent: LaunchAgent? = nil,
        reviewAgent: LaunchAgent? = nil,
        reviewPreamble: String? = nil,
        webhookPayloadMode: WebhookPayloadMode? = nil
    ) async throws -> Repo {
        let body = UpdateRepoRequest(
            localPath: localPath,
            branchPattern: branchPattern,
            autoLaunchIssues: autoLaunchIssues,
            autoReviewPrs: autoReviewPrs,
            issueAgent: issueAgent,
            reviewAgent: reviewAgent,
            reviewPreamble: reviewPreamble,
            webhookPayloadMode: webhookPayloadMode
        )
        let bodyData = try JSONEncoder().encode(body)
        let (data, _) = try await request(path: "/api/v1/repos/\(owner)/\(name)", method: "PATCH", body: bodyData)
        let response = try decoder.decode(UpdateRepoResponse.self, from: data)
        guard response.success, let repo = response.repo else {
            throw APIError.serverError(400, response.error ?? "Failed to update repository")
        }
        clearReposCache()
        clearWorkbenchCache()
        return repo
    }

    func configureWebhook(owner: String, repo: String, action: WebhookAction) async throws -> WebhookConfigurationResponse {
        let bodyData = try JSONEncoder().encode(WebhookActionRequest(action: action))
        let (data, _) = try await request(path: "/api/v1/repos/\(owner)/\(repo)/webhook", method: "POST", body: bodyData)
        let response = try decoder.decode(WebhookConfigurationResponse.self, from: data)
        if !response.success {
            throw APIError.serverError(400, response.error ?? "Failed to configure webhook")
        }
        clearReposCache()
        clearWorkbenchCache()
        return response
    }

    func webhookHealth(owner: String, repo: String) async throws -> WebhookAutomationHealth {
        let (data, _) = try await request(path: "/api/v1/repos/\(owner)/\(repo)/webhook/health")
        return try decoder.decode(WebhookHealthResponse.self, from: data).health
    }

    func recreateRepoLabels(owner: String, repo: String) async throws -> RepoLabelsRecreateResponse {
        let bodyData = try JSONEncoder().encode(RecreateRepoLabelsRequest())
        let (data, _) = try await request(path: "/api/v1/repos/\(owner)/\(repo)/labels", method: "POST", body: bodyData)
        return try decoder.decode(RepoLabelsRecreateResponse.self, from: data)
    }
}
