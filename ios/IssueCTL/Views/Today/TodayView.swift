import SwiftUI

struct TodayView: View {
    @Environment(APIClient.self) private var api
    @Environment(NetworkMonitor.self) private var network
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let onShowSettings: () -> Void
    let onShowIssues: () -> Void
    let onShowPullRequests: () -> Void
    let onShowSessions: () -> Void

    @State private var repos: [Repo] = []
    @State private var issuesByRepo: [String: [GitHubIssue]] = [:]
    @State private var pullsByRepo: [String: [GitHubPull]] = [:]
    @State private var issueRepoLookup: [String: (repo: Repo, index: Int)] = [:]
    @State private var pullRepoLookup: [String: (repo: Repo, index: Int)] = [:]
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
    @State private var didMarkLaunchUsable = false


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

    private var reviewPulls: [GitHubPull] {
        todayReviewPulls(allPulls)
    }

    private var attentionSubtitle: String {
        if activeDeployments.count > 0 {
            return "\(attentionItems.count) queued - \(activeDeployments.count) active"
        }
        return todayAttentionSubtitle(count: attentionItems.count)
    }

    private var attentionQueueSubtitle: String {
        if attentionItems.isEmpty {
            return "Nothing urgent is waiting right now."
        }

        var parts: [String] = []
        if !reviewPulls.isEmpty {
            parts.append("\(reviewPulls.count) PRs")
        }
        if !assignedIssues.isEmpty {
            parts.append("\(assignedIssues.count) issues")
        }
        if activeDeployments.count > 0 {
            parts.append("\(activeDeployments.count) sessions")
        }
        return parts.isEmpty ? "Up next from your repos" : parts.joined(separator: " - ")
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

    private var activeRepoFullNames: [String] {
        let names = Set(
            issuesByRepo.filter { !$0.value.isEmpty }.map(\.key) +
            pullsByRepo.filter { !$0.value.isEmpty }.map(\.key) +
            activeDeployments.map(\.repoFullName)
        )
        return repos.map(\.fullName).filter { names.contains($0) }
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            VStack(spacing: 0) {
                AppTopBar(title: "Today", subtitle: attentionSubtitle) {
                    HStack(spacing: 8) {
                        if !activeDeployments.isEmpty {
                            TopBarIconButton(
                                title: "\(activeDeployments.count) active sessions",
                                systemImage: "terminal",
                                accessibilityIdentifier: "today-active-sessions-button",
                                badge: activeSessionBadge,
                                action: onShowSessions
                            )
                        }

                        TopBarIconButton(
                            title: "Search",
                            systemImage: "magnifyingglass",
                            accessibilityIdentifier: "today-search-button"
                        ) {
                            showSearchSheet = true
                        }

                        TopBarIconButton(
                            title: "Settings",
                            systemImage: "gearshape",
                            accessibilityIdentifier: "today-settings-button",
                            action: onShowSettings
                        )

                        TopBarIconButton(
                            title: "Create Issue",
                            systemImage: "plus",
                            accessibilityIdentifier: "today-create-issue-button",
                            isProminent: true
                        ) {
                            showCreateSheet = true
                        }
                    }
                }

                RepoContextStrip(repos: repos, activeRepoFullNames: activeRepoFullNames)

                content
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
            .task {
                await load()
                if !didMarkLaunchUsable {
                    didMarkLaunchUsable = true
                    PerformanceTrace.markAppLaunchUsable("today")
                }
            }
            .refreshable { await load(refresh: true) }
            .accessibilityTabBarClearance()
        }
    }

    private var activeSessionBadge: String {
        activeDeployments.count > 99 ? "99+" : "\(activeDeployments.count)"
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
                Text(todayErrorDescription(errorMessage))
            } actions: {
                HStack {
                    Button("Retry") { Task { await load(refresh: true) } }
                    Button("Open Settings", action: onShowSettings)
                }
            }
            .frame(maxHeight: .infinity)
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if !network.isConnected {
                        OfflineStatusBanner(message: cacheMessage)
                    }

                    metrics

                    TodayQueueHeader(
                        title: "Work Queue",
                        subtitle: attentionQueueSubtitle,
                        action: { Task { await load(refresh: true) } }
                    )
                    .padding(.top, 4)

                    if attentionItems.isEmpty {
                        ContentUnavailableView {
                            Label("Queue Clear", systemImage: "checkmark.circle")
                        } description: {
                            Text("No reviews, assigned issues, or blocked work need attention. Browse issues or PRs when you want to pick up more work.")
                        } actions: {
                            HStack {
                                Button("Open Issues", action: onShowIssues)
                                Button("View PRs", action: onShowPullRequests)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 28)
                    } else {
                        VStack(spacing: 8) {
                            ForEach(attentionItems) { item in
                                attentionRow(for: item)
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private func todayErrorDescription(_ message: String) -> String {
        "\(message)\n\nRetry after starting issuectl web, or open Settings to update the server."
    }
    private var metrics: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        metricCards(cardWidth: 172)
                    }
                }
            } else {
                HStack(spacing: 8) {
                    metricCards()
                }
            }
        }
    }

    @ViewBuilder
    private func metricCards(cardWidth: CGFloat? = nil) -> some View {
            StatusMetricCard(
                value: "\(activeDeployments.count)",
                label: "running sessions",
                accessibilityIdentifier: "today-metric-sessions",
                action: onShowSessions
            )
            .frame(width: cardWidth)
            StatusMetricCard(
                value: "\(reviewPulls.count)",
                label: "PRs need review",
                accessibilityIdentifier: "today-metric-prs",
                action: onShowPullRequests
            )
            .frame(width: cardWidth)
            StatusMetricCard(
                value: "\(assignedIssues.count)",
                label: issueMetricLabel,
                accessibilityIdentifier: "today-metric-issues",
                action: onShowIssues
            )
            .frame(width: cardWidth)
    }

    private func attentionRow(for item: TodayAttentionItem) -> some View {
        switch item {
        case .issue(let issue, let repo, let isAttention):
            return AttentionRow(
                color: repoColor(for: repo),
                icon: issueAttentionIcon(for: issue),
                kind: "Issue",
                meta: "\(repo?.fullName ?? "Unknown repo") #\(issue.number)",
                title: issue.title,
                chips: issueChips(for: issue),
                isAttention: isAttention,
                actionTitle: issueActionTitle(for: issue),
                action: {
                    if let repo {
                        navigationPath.append(TodayDestination.issue(owner: repo.owner, repo: repo.name, number: issue.number))
                    }
                }
            )
        case .pull(let pull, let repo, let isAttention):
            return AttentionRow(
                color: IssueCTLColors.action,
                icon: pull.checksStatus == "failure" ? "exclamationmark.triangle.fill" : "arrow.triangle.merge",
                kind: "PR",
                meta: "\(repo?.fullName ?? "Unknown repo") #\(pull.number)",
                title: pull.title,
                chips: pullChips(for: pull),
                isAttention: isAttention,
                actionTitle: "Review",
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
            chips.append(.green("Ready"))
        }
        if let assignees = issue.assignees, !assignees.isEmpty {
            if let currentUserLogin, assignees.contains(where: { $0.login == currentUserLogin }) {
                chips.append(.neutral("Mine"))
            } else {
                chips.append(.neutral("Assigned"))
            }
        }
        return chips
    }

    private func pullChips(for pull: GitHubPull) -> [AttentionChip] {
        var chips: [AttentionChip] = []
        switch pull.checksStatus {
        case "failure": chips.append(.red("Failing"))
        case "success": chips.append(.green("Passing"))
        case "pending": chips.append(.orange("Pending"))
        default: break
        }
        chips.append(.blue("Review"))
        return chips
    }

    private func issueAttentionIcon(for issue: GitHubIssue) -> String {
        issue.labels.contains { $0.name.lowercased().contains("block") }
            ? "exclamationmark.octagon.fill"
            : "smallcircle.filled.circle"
    }

    private func issueActionTitle(for issue: GitHubIssue) -> String {
        issue.labels.contains { $0.name.lowercased().contains("block") }
            ? "Unblock"
            : "Open"
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
        let trace = PerformanceTrace.begin("today.load", metadata: "refresh=\(refresh)")
        isLoading = true
        errorMessage = nil
        defer {
            PerformanceTrace.end(trace, metadata: "repos=\(repos.count) issues=\(allIssues.count) pulls=\(allPulls.count) deployments=\(activeDeployments.count)")
        }
        do {
            async let deploymentsResult: Result<ActiveDeploymentsResponse, Error> = {
                do { return .success(try await api.activeDeployments()) }
                catch { return .failure(error) }
            }()
            async let userResult: Result<UserResponse, Error> = {
                do { return .success(try await api.currentUser()) }
                catch { return .failure(error) }
            }()

            let loadedRepos = try await api.repos()
            repos = loadedRepos

            let repoSnapshot = loadedRepos.map { (fullName: $0.fullName, owner: $0.owner, name: $0.name) }
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
            issueRepoLookup = makeRepoLookup(itemsByRepo: loadedIssues.items, htmlUrl: { $0.htmlUrl })
            pullRepoLookup = makeRepoLookup(itemsByRepo: loadedPulls.items, htmlUrl: { $0.htmlUrl })
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
        issueRepoLookup[issue.htmlUrl]?.repo
    }

    private func repoFor(pull: GitHubPull) -> Repo? {
        pullRepoLookup[pull.htmlUrl]?.repo
    }

    private func repoColor(for repo: Repo?) -> Color {
        guard let repo, let index = repos.firstIndex(where: { $0.id == repo.id }) else { return .secondary }
        return RepoColors.color(for: index)
    }

    private func makeRepoLookup<Item>(
        itemsByRepo: [String: [Item]],
        htmlUrl: (Item) -> String
    ) -> [String: (repo: Repo, index: Int)] {
        var lookup: [String: (repo: Repo, index: Int)] = [:]
        for (index, repo) in repos.enumerated() {
            guard let items = itemsByRepo[repo.fullName] else { continue }
            for item in items {
                lookup[htmlUrl(item)] = (repo, index)
            }
        }
        return lookup
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
