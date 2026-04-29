import SwiftUI

struct TodayView: View {
    @Environment(APIClient.self) private var api
    @Environment(NetworkMonitor.self) private var network

    let onShowSettings: () -> Void
    let onShowIssues: () -> Void
    let onShowPullRequests: () -> Void
    let onShowSessions: () -> Void

    @State private var repos: [Repo] = []
    @State private var issuesByRepo: [String: [GitHubIssue]] = [:]
    @State private var pullsByRepo: [String: [GitHubPull]] = [:]
    @State private var activeDeployments: [ActiveDeployment] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var oldestCachedAt: Date?
    @State private var currentUserLogin: String?
    @State private var userFetchFailed = false
    @State private var showCreateSheet = false
    @State private var showSearchSheet = false
    @State private var pendingSearchDestination: TodayDestination?
    @State private var actionError: String?
    @State private var navigationPath = NavigationPath()

    private var allIssues: [GitHubIssue] {
        issuesByRepo.values.flatMap { $0 }
    }

    private var allPulls: [GitHubPull] {
        pullsByRepo.values.flatMap { $0 }
    }

    private var assignedIssues: [GitHubIssue] {
        todayAssignedIssues(allIssues, currentUserLogin: currentUserLogin)
    }

    private var issueMetricLabel: String {
        todayIssueMetricLabel(currentUserLogin: currentUserLogin, userFetchFailed: userFetchFailed)
    }

    private var attentionSubtitle: String {
        todayAttentionSubtitle(count: attentionItems.count)
    }

    private var reviewPulls: [GitHubPull] {
        todayReviewPulls(allPulls)
    }

    private var attentionItems: [TodayAttentionItem] {
        var items: [TodayAttentionItem] = []

        if let pull = reviewPulls.first {
            items.append(.pull(
                pull,
                repo: repoFor(pull: pull),
                isAttention: pull.checksStatus == "failure"
            ))
        }

        for issue in assignedIssues.prefix(3) {
            items.append(.issue(
                issue,
                repo: repoFor(issue: issue),
                isAttention: issue.labels.contains { $0.name.lowercased().contains("block") }
            ))
        }

        return Array(items.prefix(4))
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            VStack(spacing: 0) {
                AppTopBar(title: "Today", subtitle: attentionSubtitle) {
                    IconChromeButton(
                        systemName: "magnifyingglass",
                        accessibilityLabel: "Search",
                        accessibilityIdentifier: "today-search-button"
                    ) {
                        showSearchSheet = true
                    }
                    IconChromeButton(
                        systemName: "gearshape",
                        accessibilityLabel: "Settings",
                        accessibilityIdentifier: "today-settings-button",
                        action: onShowSettings
                    )
                }

                content
            }
            .safeAreaInset(edge: .bottom) {
                todayBottomActions
            }
            .navigationBarHidden(true)
            .navigationDestination(for: TodayDestination.self) { destination in
                switch destination {
                case .issue(let owner, let repo, let number):
                    IssueDetailView(owner: owner, repo: repo, number: number)
                case .pull(let owner, let repo, let number):
                    PRDetailView(owner: owner, repo: repo, number: number)
                }
            }
            .sheet(isPresented: $showCreateSheet) {
                QuickCreateSheet(repos: repos, onSuccess: { warning in
                    if let warning { actionError = warning }
                    Task { await load(refresh: true) }
                })
            }
            .sheet(isPresented: $showSearchSheet, onDismiss: {
                if let destination = pendingSearchDestination {
                    navigationPath.append(destination)
                    pendingSearchDestination = nil
                }
            }) {
                TodaySearchSheet(
                    repos: repos,
                    issuesByRepo: issuesByRepo,
                    pullsByRepo: pullsByRepo,
                    onSelect: { destination in
                        pendingSearchDestination = destination
                        showSearchSheet = false
                    }
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .autoDismissError($actionError)
            .task { await load() }
            .refreshable { await load(refresh: true) }
        }
    }

    private var todayBottomActions: some View {
        VStack(spacing: 8) {
            SessionDock(deployments: activeDeployments, action: onShowSessions)
            Button {
                showCreateSheet = true
            } label: {
                Text("Create Issue")
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(IssueCTLColors.action)
            .contentShape(Rectangle())
            .padding(.horizontal, 22)
            .accessibilityIdentifier("today-create-issue-button")
        }
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private var content: some View {
        if isLoading && repos.isEmpty {
            ProgressView("Loading today...")
                .frame(maxHeight: .infinity)
        } else if let errorMessage {
            ContentUnavailableView {
                Label("Error", systemImage: "exclamationmark.triangle")
            } description: {
                Text(errorMessage)
            } actions: {
                Button("Retry") { Task { await load(refresh: true) } }
            }
            .frame(maxHeight: .infinity)
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if !network.isConnected {
                        OfflineStatusBanner(message: cacheMessage)
                    }

                    metrics

                    HStack {
                        Text("Needs Attention")
                            .font(.headline)
                        Spacer()
                        Button("Refresh") { Task { await load(refresh: true) } }
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(IssueCTLColors.action)
                            .accessibilityIdentifier("today-refresh-button")
                    }
                    .padding(.top, 4)

                    if attentionItems.isEmpty {
                        ContentUnavailableView(
                            "No Attention Items",
                            systemImage: "checkmark.circle",
                            description: Text("Nothing urgent is waiting right now.")
                        )
                        .frame(maxWidth: .infinity)
                        .padding(.top, 28)
                    } else {
                        VStack(spacing: 10) {
                            ForEach(attentionItems) { item in
                                attentionRow(for: item)
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }
        }
    }

    private var metrics: some View {
        HStack(spacing: 8) {
            StatusMetricCard(
                value: "\(activeDeployments.count)",
                label: "running sessions",
                accessibilityIdentifier: "today-metric-sessions",
                action: onShowSessions
            )
            StatusMetricCard(
                value: "\(reviewPulls.count)",
                label: "PRs need review",
                accessibilityIdentifier: "today-metric-prs",
                action: onShowPullRequests
            )
            StatusMetricCard(
                value: "\(assignedIssues.count)",
                label: issueMetricLabel,
                accessibilityIdentifier: "today-metric-issues",
                action: onShowIssues
            )
        }
    }

    private func attentionRow(for item: TodayAttentionItem) -> some View {
        switch item {
        case .issue(let issue, let repo, let isAttention):
            return AttentionRow(
                color: repoColor(for: repo),
                kicker: "\(repo?.fullName ?? "Unknown repo") - Issue #\(issue.number)",
                title: issue.title,
                chips: issueChips(for: issue),
                isAttention: isAttention,
                action: {
                    if let repo {
                        navigationPath.append(TodayDestination.issue(owner: repo.owner, repo: repo.name, number: issue.number))
                    }
                }
            )
        case .pull(let pull, let repo, let isAttention):
            return AttentionRow(
                color: IssueCTLColors.action,
                kicker: "\(repo?.fullName ?? "Unknown repo") - PR #\(pull.number)",
                title: pull.title,
                chips: pullChips(for: pull),
                isAttention: isAttention,
                action: {
                    if let repo {
                        navigationPath.append(TodayDestination.pull(owner: repo.owner, repo: repo.name, number: pull.number))
                    }
                }
            )
        }
    }

    private func issueChips(for issue: GitHubIssue) -> [AttentionChip] {
        var chips: [AttentionChip] = []
        if issue.labels.contains(where: { $0.name.lowercased().contains("block") }) {
            chips.append(.orange("Blocked"))
        } else {
            chips.append(.green("Ready to start"))
        }
        if let assignees = issue.assignees, !assignees.isEmpty {
            if let currentUserLogin, assignees.contains(where: { $0.login == currentUserLogin }) {
                chips.append(.neutral("Assigned to you"))
            } else {
                chips.append(.neutral("Assigned"))
            }
        }
        return chips
    }

    private func pullChips(for pull: GitHubPull) -> [AttentionChip] {
        var chips: [AttentionChip] = []
        switch pull.checksStatus {
        case "failure": chips.append(.red("Checks failing"))
        case "success": chips.append(.green("Checks pass"))
        case "pending": chips.append(.orange("Checks pending"))
        default: break
        }
        chips.append(.blue("Review requested"))
        return chips
    }

    private var cacheMessage: String {
        if let oldestCachedAt {
            let formatter = RelativeDateTimeFormatter()
            formatter.unitsStyle = .abbreviated
            return "Offline - showing cached data from \(formatter.localizedString(for: oldestCachedAt, relativeTo: Date()))"
        }
        return "Offline - showing cached data"
    }

    private func load(refresh: Bool = false) async {
        isLoading = true
        errorMessage = nil
        do {
            repos = try await api.repos()

            async let deploymentsResult: Result<ActiveDeploymentsResponse, Error> = {
                do { return .success(try await api.activeDeployments()) }
                catch { return .failure(error) }
            }()
            async let userResult: Result<UserResponse, Error> = {
                do { return .success(try await api.currentUser()) }
                catch { return .failure(error) }
            }()

            let repoSnapshot = repos.map { (fullName: $0.fullName, owner: $0.owner, name: $0.name) }
            async let issueResults = loadIssues(for: repoSnapshot, refresh: refresh)
            async let pullResults = loadPulls(for: repoSnapshot, refresh: refresh)

            switch await deploymentsResult {
            case .success(let response): activeDeployments = response.deployments
            case .failure: activeDeployments = []
            }
            switch await userResult {
            case .success(let user):
                currentUserLogin = user.login
                userFetchFailed = false
            case .failure:
                currentUserLogin = nil
                userFetchFailed = true
            }

            let loadedIssues = await issueResults
            let loadedPulls = await pullResults
            issuesByRepo = loadedIssues.items
            pullsByRepo = loadedPulls.items
            oldestCachedAt = (loadedIssues.cachedDates + loadedPulls.cachedDates).min()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func loadIssues(
        for repos: [(fullName: String, owner: String, name: String)],
        refresh: Bool
    ) async -> (items: [String: [GitHubIssue]], cachedDates: [Date]) {
        await withTaskGroup(of: (String, [GitHubIssue]?, String?).self) { group in
            for repo in repos {
                group.addTask { [api] in
                    do {
                        let response = try await api.issues(owner: repo.owner, repo: repo.name, refresh: refresh)
                        return (repo.fullName, response.issues, response.cachedAt)
                    } catch {
                        return (repo.fullName, nil, nil)
                    }
                }
            }

            var items: [String: [GitHubIssue]] = [:]
            var cachedDates: [Date] = []
            for await (fullName, issues, cachedAt) in group {
                if let issues { items[fullName] = issues }
                if let cachedAt, let date = parseIssueCTLDate(cachedAt) {
                    cachedDates.append(date)
                }
            }
            return (items, cachedDates)
        }
    }

    private func loadPulls(
        for repos: [(fullName: String, owner: String, name: String)],
        refresh: Bool
    ) async -> (items: [String: [GitHubPull]], cachedDates: [Date]) {
        await withTaskGroup(of: (String, [GitHubPull]?, String?).self) { group in
            for repo in repos {
                group.addTask { [api] in
                    do {
                        let response = try await api.pulls(owner: repo.owner, repo: repo.name, refresh: refresh)
                        return (repo.fullName, response.pulls, response.cachedAt)
                    } catch {
                        return (repo.fullName, nil, nil)
                    }
                }
            }

            var items: [String: [GitHubPull]] = [:]
            var cachedDates: [Date] = []
            for await (fullName, pulls, cachedAt) in group {
                if let pulls { items[fullName] = pulls }
                if let cachedAt, let date = parseIssueCTLDate(cachedAt) {
                    cachedDates.append(date)
                }
            }
            return (items, cachedDates)
        }
    }

    private func repoFor(issue: GitHubIssue) -> Repo? {
        repoForItem(issue, in: issuesByRepo, repos: repos, htmlUrl: { $0.htmlUrl })
    }

    private func repoFor(pull: GitHubPull) -> Repo? {
        repoForItem(pull, in: pullsByRepo, repos: repos, htmlUrl: { $0.htmlUrl })
    }

    private func repoColor(for repo: Repo?) -> Color {
        guard let repo, let index = repos.firstIndex(where: { $0.id == repo.id }) else { return .secondary }
        return RepoColors.color(for: index)
    }

}

enum TodayDestination: Hashable {
    case issue(owner: String, repo: String, number: Int)
    case pull(owner: String, repo: String, number: Int)
}

private enum TodayAttentionItem: Identifiable {
    case issue(GitHubIssue, repo: Repo?, isAttention: Bool)
    case pull(GitHubPull, repo: Repo?, isAttention: Bool)

    var id: String {
        switch self {
        case .issue(let issue, _, _): "issue-\(issue.id)"
        case .pull(let pull, _, _): "pull-\(pull.id)"
        }
    }
}
