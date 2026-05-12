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
