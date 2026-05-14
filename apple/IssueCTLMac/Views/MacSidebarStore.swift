import Foundation

@Observable @MainActor
final class MacSidebarStore {
    private(set) var repos: [Repo] = []
    private(set) var issues: [MacIssueListItem] = []
    private(set) var drafts: [Draft] = []
    private(set) var sessions: [ActiveDeployment] = []
    private(set) var currentUserLogin: String?
    private(set) var userFetchFailed = false
    private(set) var priorities: [String: Priority] = [:]
    private(set) var isLoadingPriorities = false
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var lastLoadedAt: Date?

    var summary: String {
        "\(issues.count) issues • \(drafts.count) drafts • \(sessions.count) active"
    }

    func reset() {
        repos = []
        issues = []
        drafts = []
        sessions = []
        currentUserLogin = nil
        userFetchFailed = false
        priorities = [:]
        isLoadingPriorities = false
        errorMessage = nil
        lastLoadedAt = nil
    }

    func load(api: APIClient, refresh: Bool) async {
        guard !isLoading else { return }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let loadedRepos = try await api.repos(refresh: refresh)
            async let draftsResult = api.listDrafts()
            async let sessionsResult = api.activeDeployments(refresh: refresh)
            async let userResult: Result<UserResponse, Error> = {
                do { return .success(try await api.currentUser(refresh: refresh)) }
                catch { return .failure(error) }
            }()

            var loadedIssues: [MacIssueListItem] = []
            var issueFailures: [String] = []

            for (index, repo) in loadedRepos.enumerated() {
                do {
                    let response = try await api.issues(owner: repo.owner, repo: repo.name, refresh: refresh)
                    loadedIssues.append(contentsOf: response.issues.map { issue in
                        MacIssueListItem(issue: issue, repo: repo, repoIndex: index)
                    })
                } catch {
                    issueFailures.append("\(repo.fullName): \(error.localizedDescription)")
                }
            }

            repos = loadedRepos
            issues = loadedIssues.sorted { lhs, rhs in
                (lhs.issue.updatedDate ?? .distantPast) > (rhs.issue.updatedDate ?? .distantPast)
            }
            drafts = try await draftsResult.drafts
            sessions = try await sessionsResult.deployments
            switch await userResult {
            case .success(let user):
                currentUserLogin = user.login
                userFetchFailed = false
            case .failure:
                currentUserLogin = nil
                userFetchFailed = true
            }
            lastLoadedAt = Date()
            await loadPriorities(api: api, repos: loadedRepos)

            if !issueFailures.isEmpty {
                errorMessage = "Some repos failed to load: \(issueFailures.joined(separator: "; "))"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadPriorities(api: APIClient, repos: [Repo]? = nil) async {
        let reposToLoad = repos ?? self.repos
        isLoadingPriorities = true
        defer { isLoadingPriorities = false }

        var loadedPriorities: [String: Priority] = [:]
        var failures: [String] = []
        for repo in reposToLoad {
            do {
                let items = try await api.listPriorities(owner: repo.owner, repo: repo.name)
                for item in items {
                    loadedPriorities["\(repo.owner)/\(repo.name)#\(item.issueNumber)"] = item.priority
                }
            } catch {
                failures.append("\(repo.name) priorities (\(error.localizedDescription))")
            }
        }

        priorities = loadedPriorities
        if !failures.isEmpty {
            errorMessage = "Some priorities failed to load: \(failures.joined(separator: "; "))"
        }
    }

    func refreshDrafts(api: APIClient) async {
        errorMessage = nil
        do {
            drafts = try await api.listDrafts().drafts
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createDraft(api: APIClient, title: String, body: String?, priority: Priority) async throws {
        let response = try await api.createDraft(
            body: CreateDraftRequestBody(title: title, body: body, priority: priority)
        )
        guard response.success else {
            throw MacSidebarStoreError.operationFailed(response.error ?? "Failed to create draft")
        }
        await refreshDrafts(api: api)
    }

    func createIssue(
        api: APIClient,
        title: String,
        body: String?,
        priority: Priority,
        repo: Repo,
        labels: [String]
    ) async throws -> AssignDraftResponse {
        let createResponse = try await api.createDraft(
            body: CreateDraftRequestBody(title: title, body: body, priority: priority)
        )
        guard createResponse.success, let draftId = createResponse.id else {
            throw MacSidebarStoreError.operationFailed(createResponse.error ?? "Failed to create issue")
        }
        let assignResponse = try await api.assignDraftWithLabels(
            id: draftId,
            body: AssignDraftWithLabelsRequestBody(repoId: repo.id, labels: labels.isEmpty ? nil : labels)
        )
        guard assignResponse.success else {
            throw MacSidebarStoreError.operationFailed(assignResponse.error ?? "Failed to create issue")
        }
        await load(api: api, refresh: true)
        return assignResponse
    }

    func updateDraft(api: APIClient, id: String, title: String, body: String?, priority: Priority) async throws {
        let response = try await api.updateDraft(
            id: id,
            body: UpdateDraftRequestBody(title: title, body: body, priority: priority)
        )
        guard response.success else {
            throw MacSidebarStoreError.operationFailed(response.error ?? "Failed to update draft")
        }
        await refreshDrafts(api: api)
    }

    func deleteDraft(api: APIClient, id: String) async throws {
        let response = try await api.deleteDraft(id: id)
        guard response.success else {
            throw MacSidebarStoreError.operationFailed(response.error ?? "Failed to delete draft")
        }
        drafts.removeAll { $0.id == id }
    }

    func assignDraftWithLabels(api: APIClient, id: String, repo: Repo, labels: [String]) async throws -> AssignDraftResponse {
        let response = try await api.assignDraftWithLabels(
            id: id,
            body: AssignDraftWithLabelsRequestBody(repoId: repo.id, labels: labels.isEmpty ? nil : labels)
        )
        guard response.success else {
            throw MacSidebarStoreError.operationFailed(response.error ?? "Failed to assign draft")
        }
        await load(api: api, refresh: true)
        return response
    }

    func issueDetail(api: APIClient, item: MacIssueListItem, refresh: Bool) async throws -> IssueDetailResponse {
        let detail = try await api.issueDetail(
            owner: item.repo.owner,
            repo: item.repo.name,
            number: item.issue.number,
            refresh: refresh
        )
        replaceIssue(detail.issue, in: item.repo)
        return detail
    }

    func commentOnIssue(api: APIClient, item: MacIssueListItem, body: String) async throws {
        let response = try await api.commentOnIssue(
            owner: item.repo.owner,
            repo: item.repo.name,
            number: item.issue.number,
            body: IssueCommentRequestBody(body: body)
        )
        guard response.success else {
            throw MacSidebarStoreError.operationFailed(response.error ?? "Failed to add comment")
        }
    }

    func updateIssue(api: APIClient, item: MacIssueListItem, title: String?, body: String?) async throws {
        let response = try await api.updateIssue(
            owner: item.repo.owner,
            repo: item.repo.name,
            number: item.issue.number,
            body: UpdateIssueRequestBody(title: title, body: body)
        )
        guard response.success else {
            throw MacSidebarStoreError.operationFailed(response.error ?? "Failed to update issue")
        }
    }

    func updateIssueState(api: APIClient, item: MacIssueListItem, state: String, comment: String? = nil) async throws {
        let response = try await api.updateIssueState(
            owner: item.repo.owner,
            repo: item.repo.name,
            number: item.issue.number,
            body: IssueStateRequestBody(state: state, comment: comment)
        )
        guard response.success else {
            throw MacSidebarStoreError.operationFailed(response.error ?? "Failed to update issue")
        }
    }

    func editComment(api: APIClient, item: MacIssueListItem, commentId: Int, body: String) async throws {
        let response = try await api.editComment(
            owner: item.repo.owner,
            repo: item.repo.name,
            number: item.issue.number,
            body: EditCommentRequestBody(commentId: commentId, body: body)
        )
        guard response.success else {
            throw MacSidebarStoreError.operationFailed(response.error ?? "Failed to edit comment")
        }
    }

    func deleteComment(api: APIClient, item: MacIssueListItem, commentId: Int) async throws {
        let response = try await api.deleteComment(
            owner: item.repo.owner,
            repo: item.repo.name,
            number: item.issue.number,
            body: DeleteCommentRequestBody(commentId: commentId)
        )
        guard response.success else {
            throw MacSidebarStoreError.operationFailed(response.error ?? "Failed to delete comment")
        }
    }

    func repoLabels(api: APIClient, item: MacIssueListItem) async throws -> [GitHubLabel] {
        try await api.listRepoLabels(owner: item.repo.owner, repo: item.repo.name).labels
    }

    func toggleLabel(api: APIClient, item: MacIssueListItem, label: String, action: String) async throws {
        let response = try await api.toggleLabel(
            owner: item.repo.owner,
            repo: item.repo.name,
            number: item.issue.number,
            body: ToggleLabelRequestBody(label: label, action: action)
        )
        guard response.success else {
            throw MacSidebarStoreError.operationFailed(response.error ?? "Failed to update label")
        }
    }

    func collaborators(api: APIClient, item: MacIssueListItem) async throws -> [CollaboratorInfo] {
        try await api.collaborators(owner: item.repo.owner, repo: item.repo.name)
    }

    func updateAssignees(api: APIClient, item: MacIssueListItem, assignees: [String]) async throws -> [String] {
        try await api.updateAssignees(
            owner: item.repo.owner,
            repo: item.repo.name,
            number: item.issue.number,
            assignees: assignees
        )
    }

    func reassignIssue(api: APIClient, item: MacIssueListItem, target: Repo) async throws -> ReassignResponse {
        let response = try await api.reassignIssue(
            owner: item.repo.owner,
            repo: item.repo.name,
            number: item.issue.number,
            targetOwner: target.owner,
            targetRepo: target.name
        )
        guard response.success else {
            throw MacSidebarStoreError.operationFailed(response.error ?? "Failed to reassign issue")
        }
        return response
    }

    func setPriority(api: APIClient, item: MacIssueListItem, priority: Priority) async throws {
        let response = try await api.setPriority(
            owner: item.repo.owner,
            repo: item.repo.name,
            number: item.issue.number,
            priority: priority
        )
        guard response.success else {
            throw MacSidebarStoreError.operationFailed(response.error ?? "Failed to set priority")
        }
    }

    func refreshSessions(api: APIClient) async {
        errorMessage = nil
        do {
            sessions = try await api.activeDeployments(refresh: true).deployments
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func activeSession(for item: MacIssueListItem) -> ActiveDeployment? {
        sessions.first { session in
            session.isActive &&
            session.owner == item.repo.owner &&
            session.repoName == item.repo.name &&
            session.issueNumber == item.issue.number
        }
    }

    func launchIssue(
        api: APIClient,
        item: MacIssueListItem,
        detail: IssueDetailResponse?,
        options providedOptions: MacIssueLaunchOptions? = nil
    ) async throws -> ActiveDeployment {
        await refreshSessions(api: api)
        if let existing = activeSession(for: item) {
            return existing
        }

        let options: MacIssueLaunchOptions
        if let providedOptions {
            options = providedOptions
        } else {
            let settings = try? await api.getSettings()
            options = MacIssueLaunchOptions.defaults(for: item, detail: detail, settings: settings)
        }
        let body = options.requestBody(idempotencyKey: UUID().uuidString)

        let response = try await api.launch(
            owner: item.repo.owner,
            repo: item.repo.name,
            number: item.issue.number,
            body: body
        )
        guard response.success, let deploymentId = response.deploymentId else {
            throw MacSidebarStoreError.operationFailed(response.error ?? "Failed to launch issue")
        }

        await refreshSessions(api: api)
        return activeSession(for: item) ?? ActiveDeployment(
            id: deploymentId,
            repoId: item.repo.id,
            issueNumber: item.issue.number,
            branchName: options.branchName,
            workspaceMode: options.workspaceMode,
            workspacePath: "",
            linkedPrNumber: nil,
            state: .active,
            launchedAt: sharedISO8601Formatter.string(from: Date()),
            endedAt: nil,
            ttydPort: response.ttydPort,
            ttydPid: nil,
            owner: item.repo.owner,
            repoName: item.repo.name
        )
    }

    func terminalURL(api: APIClient, session: ActiveDeployment) async throws -> URL {
        let result = try await api.ensureTtyd(deploymentId: session.id)
        switch result {
        case .available(let port, let token, _):
            var components = URLComponents(string: "\(api.serverURL)/api/terminal/\(port)/")
            components?.queryItems = [
                URLQueryItem(name: "terminalToken", value: token),
                URLQueryItem(name: "lineHeight", value: "1.25"),
                URLQueryItem(name: "disableResizeOverlay", value: "true"),
                URLQueryItem(name: "rendererType", value: "canvas"),
            ]
            guard let url = components?.url else {
                throw MacSidebarStoreError.operationFailed("Invalid terminal URL")
            }
            return url
        case .unavailable(let error):
            throw MacSidebarStoreError.operationFailed(error ?? "Terminal is not ready")
        }
    }

    func endSession(api: APIClient, session: ActiveDeployment) async throws {
        let response = try await api.endSession(
            deploymentId: session.id,
            owner: session.owner,
            repo: session.repoName,
            issueNumber: session.issueNumber
        )
        guard response.success else {
            throw MacSidebarStoreError.operationFailed(response.error ?? "Failed to end session")
        }
        sessions.removeAll { $0.id == session.id }
    }

    private func replaceIssue(_ issue: GitHubIssue, in repo: Repo) {
        let item = MacIssueListItem(issue: issue, repo: repo, repoIndex: repos.firstIndex(where: { $0.id == repo.id }) ?? 0)
        if let index = issues.firstIndex(where: { $0.id == item.id }) {
            issues[index] = item
        } else {
            issues.append(item)
        }
        issues.sort { lhs, rhs in
            (lhs.issue.updatedDate ?? .distantPast) > (rhs.issue.updatedDate ?? .distantPast)
        }
    }
}

enum MacLaunchResumeBehavior: String, CaseIterable, Identifiable {
    case automatic
    case resume
    case reset

    var id: String { rawValue }

    var title: String {
        switch self {
        case .automatic: "Auto"
        case .resume: "Resume"
        case .reset: "Reset"
        }
    }

    var forceResume: Bool? {
        switch self {
        case .automatic: nil
        case .resume: true
        case .reset: false
        }
    }

    static func behavior(forceResume: Bool?) -> MacLaunchResumeBehavior {
        switch forceResume {
        case true: .resume
        case false: .reset
        case nil: .automatic
        }
    }
}

struct MacIssueLaunchOptions: Equatable {
    var agent: LaunchAgent
    var branchName: String
    var workspaceMode: WorkspaceMode
    var selectedCommentIndices: Set<Int>
    var selectedFilePaths: Set<String>
    var preamble: String
    var resumeBehavior: MacLaunchResumeBehavior

    static func defaults(
        for item: MacIssueListItem,
        detail: IssueDetailResponse?,
        settings: [String: String]?
    ) -> MacIssueLaunchOptions {
        MacIssueLaunchOptions(
            agent: LaunchAgent.settingValue(settings?["launch_agent"]),
            branchName: generateBranchName(issueNumber: item.issue.number, issueTitle: item.issue.title),
            workspaceMode: item.repo.localPath?.isEmpty == false ? .worktree : .clone,
            selectedCommentIndices: [],
            selectedFilePaths: [],
            preamble: "",
            resumeBehavior: .automatic
        )
    }

    func requestBody(idempotencyKey: String?) -> LaunchRequestBody {
        LaunchRequestBody(
            agent: agent,
            branchName: branchName,
            workspaceMode: workspaceMode,
            selectedCommentIndices: selectedCommentIndices.sorted(),
            selectedFilePaths: selectedFilePaths.sorted(),
            preamble: preamble.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : preamble,
            forceResume: resumeBehavior.forceResume,
            idempotencyKey: idempotencyKey
        )
    }
}

struct MacIssueListItem: Identifiable {
    let issue: GitHubIssue
    let repo: Repo
    let repoIndex: Int

    var id: String { issue.id }
    var repoFullName: String { repo.fullName }
    var isOpen: Bool { issue.isOpen }
}

enum MacSidebarStoreError: LocalizedError {
    case operationFailed(String)

    var errorDescription: String? {
        switch self {
        case .operationFailed(let message): message
        }
    }
}
