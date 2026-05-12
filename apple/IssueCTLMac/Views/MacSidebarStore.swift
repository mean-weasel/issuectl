import Foundation

@Observable @MainActor
final class MacSidebarStore {
    private(set) var repos: [Repo] = []
    private(set) var issues: [MacIssueListItem] = []
    private(set) var drafts: [Draft] = []
    private(set) var sessions: [ActiveDeployment] = []
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
            lastLoadedAt = Date()

            if !issueFailures.isEmpty {
                errorMessage = "Some repos failed to load: \(issueFailures.joined(separator: "; "))"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refreshDrafts(api: APIClient) async {
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

    func updateIssueState(api: APIClient, item: MacIssueListItem, state: String) async throws {
        let response = try await api.updateIssueState(
            owner: item.repo.owner,
            repo: item.repo.name,
            number: item.issue.number,
            body: IssueStateRequestBody(state: state, comment: nil)
        )
        guard response.success else {
            throw MacSidebarStoreError.operationFailed(response.error ?? "Failed to update issue")
        }
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

    func launchIssue(api: APIClient, item: MacIssueListItem, detail: IssueDetailResponse?) async throws -> ActiveDeployment {
        await refreshSessions(api: api)
        if let existing = activeSession(for: item) {
            return existing
        }

        let settings = try? await api.getSettings()
        let agent = LaunchAgent.settingValue(settings?["launch_agent"])
        let branchName = generateBranchName(issueNumber: item.issue.number, issueTitle: item.issue.title)
        let workspaceMode: WorkspaceMode = item.repo.localPath?.isEmpty == false ? .worktree : .clone
        let body = LaunchRequestBody(
            agent: agent,
            branchName: branchName,
            workspaceMode: workspaceMode,
            selectedCommentIndices: [],
            selectedFilePaths: [],
            preamble: nil,
            forceResume: nil,
            idempotencyKey: UUID().uuidString
        )

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
            branchName: branchName,
            workspaceMode: workspaceMode,
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
