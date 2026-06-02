import Foundation

enum WorkbenchIssueFilter: String, CaseIterable, Identifiable, Sendable {
    case unassigned
    case open
    case running
    case closed

    var id: String { rawValue }

    var title: String {
        switch self {
        case .unassigned:
            return "Drafts"
        case .open:
            return "Open"
        case .running:
            return "Running"
        case .closed:
            return "Closed"
        }
    }

    var icon: String {
        switch self {
        case .unassigned:
            return "doc.text"
        case .open:
            return "circle"
        case .running:
            return "play.circle"
        case .closed:
            return "checkmark.circle"
        }
    }

    func includes(_ issue: WorkbenchBoardIssue) -> Bool {
        switch self {
        case .unassigned:
            return false
        case .open:
            return issue.issue.isOpen && !issue.isRunning
        case .running:
            return issue.issue.isOpen && issue.isRunning
        case .closed:
            return !issue.issue.isOpen
        }
    }
}

struct WorkbenchBoardIssue: Identifiable, Sendable {
    let repoId: Int
    let repoIndex: Int
    let owner: String
    let repoName: String
    let issue: WorkbenchIssueSummary
    let deployment: ActiveDeployment?

    var id: String { "\(repoId)-\(issue.number)" }
    var repoFullName: String { "\(owner)/\(repoName)" }
    var accessibilityIdentifier: String { "board-issue-\(repoId)-\(issue.number)" }
    var isRunning: Bool { deployment != nil || issue.hasActiveDeployment }

    var statusLabel: String {
        if !issue.isOpen { return "Closed" }
        return isRunning ? "Running" : "Open"
    }
}

struct WorkbenchBoardFocus: Equatable, Sendable {
    let owner: String
    let repo: String
    let number: Int
}

@Observable @MainActor
final class WorkbenchStore {
    var payload: WorkbenchPayload?
    var selectedRepoIds: Set<Int> = []
    var filter: WorkbenchIssueFilter = .open
    var isLoading = false
    var isRefreshing = false
    var errorMessage: String?

    var repos: [WorkbenchRepo] {
        payload?.repos ?? []
    }

    var counts: [WorkbenchIssueFilter: Int] {
        let issues = boardIssues(filteringByRepoOnly: true)
        return [
            .unassigned: payload?.drafts.count ?? 0,
            .open: issues.filter { $0.issue.isOpen && !$0.isRunning }.count,
            .running: issues.filter { $0.issue.isOpen && $0.isRunning }.count,
            .closed: issues.filter { !$0.issue.isOpen }.count,
        ]
    }

    var visibleIssues: [WorkbenchBoardIssue] {
        boardIssues(filteringByRepoOnly: false)
    }

    var visibleDrafts: [Draft] {
        guard filter == .unassigned else { return [] }
        return payload?.drafts ?? []
    }

    var selectedRepoSummary: String {
        if repos.isEmpty {
            return "None"
        }
        if selectedRepoIds.isEmpty {
            return repos.count == 1 ? repos[0].name : "All \(repos.count)"
        }

        let names = repos
            .filter { selectedRepoIds.contains($0.id) }
            .map(\.name)

        if names.isEmpty {
            return "\(selectedRepoIds.count) selected"
        }
        if names.count <= 2 {
            return names.joined(separator: ", ")
        }
        return "\(names[0]), \(names[1]) +\(names.count - 2)"
    }

    var headerSubtitle: String {
        let open = counts[.open] ?? 0
        let running = counts[.running] ?? 0
        let drafts = counts[.unassigned] ?? 0
        if open == 0 && running == 0 {
            return drafts > 0 ? "\(drafts) drafts" : "No open board work"
        }
        if running > 0 {
            return "\(open) open - \(running) running"
        }
        return "\(open) open issues"
    }

    func load(api: APIClient, refresh: Bool = false) async {
        if payload == nil {
            isLoading = true
        } else {
            isRefreshing = true
        }
        defer {
            isLoading = false
            isRefreshing = false
        }

        do {
            let payload = try await api.workbench(refresh: refresh)
            self.payload = payload
            errorMessage = nil
            let repoIds = Set(payload.repos.map(\.id))
            selectedRepoIds.formIntersection(repoIds)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @discardableResult
    func applyBoardRoute(
        repoFullName: String?,
        issueNumber: Int?,
        deploymentId: Int?
    ) -> WorkbenchBoardFocus? {
        let routeRepos = reposForRoute(repoFullName)

        if let deploymentId,
           let match = routeRepos.lazy.compactMap({ repo in
               repo.deployments.first(where: { $0.id == deploymentId }).map { (repo: repo, deployment: $0) }
           }).first {
            selectedRepoIds = [match.repo.id]
            filter = .running
            guard match.deployment.targetType == .issue else { return nil }
            return WorkbenchBoardFocus(
                owner: match.repo.owner,
                repo: match.repo.name,
                number: match.deployment.targetNumber
            )
        }

        if let issueNumber,
           let match = routeRepos.lazy.compactMap({ repo in
               repo.issues.first(where: { $0.number == issueNumber }).map { (repo: repo, issue: $0) }
           }).first {
            selectedRepoIds = [match.repo.id]
            let item = boardIssue(repo: match.repo, repoIndex: repoIndex(for: match.repo), issue: match.issue)
            filter = filter(for: item)
            return WorkbenchBoardFocus(owner: match.repo.owner, repo: match.repo.name, number: issueNumber)
        }

        if let repoFullName,
           let repo = repos.first(where: { $0.fullName == repoFullName }) {
            selectedRepoIds = [repo.id]
        }

        return nil
    }

    private func boardIssues(filteringByRepoOnly: Bool) -> [WorkbenchBoardIssue] {
        var issues: [WorkbenchBoardIssue] = []
        for (index, repo) in repos.enumerated() where selectedRepoIds.isEmpty || selectedRepoIds.contains(repo.id) {
            for issue in repo.issues {
                let item = boardIssue(repo: repo, repoIndex: index, issue: issue)
                if filteringByRepoOnly || filter.includes(item) {
                    issues.append(item)
                }
            }
        }

        return issues.sorted { left, right in
            if left.isRunning != right.isRunning {
                return left.isRunning && !right.isRunning
            }
            if left.issue.priority.sortIndex != right.issue.priority.sortIndex {
                return left.issue.priority.sortIndex < right.issue.priority.sortIndex
            }
            if left.issue.updatedAt != right.issue.updatedAt {
                return left.issue.updatedAt > right.issue.updatedAt
            }
            return left.id < right.id
        }
    }

    private func reposForRoute(_ repoFullName: String?) -> [WorkbenchRepo] {
        guard let repoFullName else { return repos }
        return repos.filter { $0.fullName == repoFullName }
    }

    private func repoIndex(for repo: WorkbenchRepo) -> Int {
        repos.firstIndex(where: { $0.id == repo.id }) ?? 0
    }

    private func boardIssue(repo: WorkbenchRepo, repoIndex: Int, issue: WorkbenchIssueSummary) -> WorkbenchBoardIssue {
        let deployment = repo.deployments.first {
            $0.targetType == .issue && $0.targetNumber == issue.number
        }
        return WorkbenchBoardIssue(
            repoId: repo.id,
            repoIndex: repoIndex,
            owner: repo.owner,
            repoName: repo.name,
            issue: issue,
            deployment: deployment
        )
    }

    private func filter(for issue: WorkbenchBoardIssue) -> WorkbenchIssueFilter {
        if !issue.issue.isOpen {
            return .closed
        }
        return issue.isRunning ? .running : .open
    }
}
