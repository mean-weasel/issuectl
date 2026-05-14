import SwiftUI

enum MacTodayAttentionKind: Equatable {
    case pull
    case issue
    case session

    var title: String {
        switch self {
        case .pull: "PR"
        case .issue: "Issue"
        case .session: "Session"
        }
    }

    var iconName: String {
        switch self {
        case .pull: "arrow.triangle.merge"
        case .issue: "smallcircle.filled.circle"
        case .session: "terminal"
        }
    }
}

struct MacTodayAttentionItem: Identifiable, Equatable {
    let id: String
    let kind: MacTodayAttentionKind
    let repoFullName: String
    let number: Int
    let title: String
    let subtitle: String
    let isAttention: Bool
}

struct MacTodayProjection: Equatable {
    let activeSessionCount: Int
    let reviewPullCount: Int
    let issueCount: Int
    let items: [MacTodayAttentionItem]

    var subtitle: String {
        let count = items.count
        return count == 1 ? "1 item needs attention" : "\(count) items need attention"
    }
}

enum MacTodayModel {
    static func project(
        issues: [MacIssueListItem],
        pulls: [MacPullRequestListItem],
        sessions: [ActiveDeployment],
        searchText: String,
        currentUserLogin: String?
    ) -> MacTodayProjection {
        let assignedIssues = todayIssues(issues, currentUserLogin: currentUserLogin)
        let reviewPulls = pulls
            .filter { needsReviewAttention($0.pull) }
            .sorted { sortPull($0.pull, before: $1.pull) }
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        let issueItems = assignedIssues
            .filter { query.isEmpty || matches(query: query, title: $0.issue.title, body: $0.issue.body, repoFullName: $0.repoFullName, number: $0.issue.number) }
            .prefix(4)
            .map { item in
                MacTodayAttentionItem(
                    id: "issue-\(item.id)",
                    kind: .issue,
                    repoFullName: item.repoFullName,
                    number: item.issue.number,
                    title: item.issue.title,
                    subtitle: issueSubtitle(item.issue),
                    isAttention: item.issue.labels.contains { $0.name.lowercased().contains("block") }
                )
            }

        let pullItems = reviewPulls
            .filter { query.isEmpty || matches(query: query, title: $0.pull.title, body: $0.pull.body, repoFullName: $0.repoFullName, number: $0.pull.number) }
            .prefix(4)
            .map { item in
                MacTodayAttentionItem(
                    id: "pull-\(item.id)",
                    kind: .pull,
                    repoFullName: item.repoFullName,
                    number: item.pull.number,
                    title: item.pull.title,
                    subtitle: pullSubtitle(item.pull),
                    isAttention: item.pull.checksStatus == "failure"
                )
            }

        let sessionItems: [MacTodayAttentionItem] = query.isEmpty ? sessions.prefix(3).map { session in
            MacTodayAttentionItem(
                id: "session-\(session.id)",
                kind: .session,
                repoFullName: session.repoFullName,
                number: session.issueNumber,
                title: session.branchName,
                subtitle: "\(session.workspaceMode.rawValue) - \(session.runningDuration)",
                isAttention: false
            )
        } : []

        return MacTodayProjection(
            activeSessionCount: sessions.filter(\.isActive).count,
            reviewPullCount: reviewPulls.count,
            issueCount: assignedIssues.count,
            items: Array((pullItems + issueItems + sessionItems).prefix(8))
        )
    }

    static func needsReviewAttention(_ pull: GitHubPull) -> Bool {
        pull.isOpen && (pull.checksStatus == "failure" || pull.checksStatus == "pending")
    }

    private static func todayIssues(_ issues: [MacIssueListItem], currentUserLogin: String?) -> [MacIssueListItem] {
        let openIssues = issues.filter(\.issue.isOpen)
        guard let currentUserLogin else { return openIssues }
        return openIssues.filter { item in
            (item.issue.assignees ?? []).contains { $0.login == currentUserLogin }
        }
    }

    private static func matches(query: String, title: String, body: String?, repoFullName: String, number: Int) -> Bool {
        [
            title,
            body ?? "",
            repoFullName,
            "#\(number)",
            "\(number)",
        ]
        .joined(separator: " ")
        .lowercased()
        .contains(query)
    }

    private static func issueSubtitle(_ issue: GitHubIssue) -> String {
        if issue.labels.contains(where: { $0.name.lowercased().contains("block") }) {
            return "Blocked"
        }
        if let assignees = issue.assignees, !assignees.isEmpty {
            return "Assigned"
        }
        return "Open"
    }

    private static func pullSubtitle(_ pull: GitHubPull) -> String {
        switch pull.checksStatus {
        case "failure": "Failing checks"
        case "pending": "Pending checks"
        default: "Needs review"
        }
    }

    private static func sortPull(_ lhs: GitHubPull, before rhs: GitHubPull) -> Bool {
        let lhsIndex = pullSortIndex(lhs)
        let rhsIndex = pullSortIndex(rhs)
        if lhsIndex != rhsIndex { return lhsIndex < rhsIndex }
        return lhs.number < rhs.number
    }

    private static func pullSortIndex(_ pull: GitHubPull) -> Int {
        switch pull.checksStatus {
        case "failure": 0
        case "pending": 1
        default: 2
        }
    }
}

struct MacTodayView: View {
    @Environment(APIClient.self) private var api
    @Environment(NetworkMonitor.self) private var network
    @Environment(\.macSidebarTextScale) private var textScale

    let store: MacSidebarStore

    @State private var pulls: [MacPullRequestListItem] = []
    @State private var isLoadingPulls = false
    @State private var pullsFromCache = false
    @State private var pullsCachedAt: String?
    @State private var errorMessage: String?
    @State private var searchText = ""
    @State private var selectedIssue: MacIssueListItem?
    @State private var selectedPull: MacPullRequestListItem?
    @State private var isShowingQuickCreate = false

    private var projection: MacTodayProjection {
        MacTodayModel.project(
            issues: store.issues,
            pulls: pulls,
            sessions: store.sessions,
            searchText: searchText,
            currentUserLogin: store.currentUserLogin
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            controls

            if isLoadingPulls && pulls.isEmpty && store.issues.isEmpty {
                ProgressView("Loading today...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if projection.items.isEmpty {
                ContentUnavailableView(emptyTitle, systemImage: "checkmark.circle", description: Text(emptyDescription))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityIdentifier("mac-today-empty-state")
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(projection.items) { item in
                            Button {
                                open(item)
                            } label: {
                                MacTodayAttentionRow(item: item)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("mac-today-row-\(item.kind.title.lowercased())-\(item.repoFullName)-\(item.number)")

                            Divider()
                        }
                    }
                    .padding(.horizontal, 8)
                }
            }
        }
        .task { await loadPulls(refresh: false) }
        .onChange(of: store.repos.count) { _, _ in
            Task { await loadPulls(refresh: false) }
        }
        .sheet(item: $selectedIssue) { item in
            MacIssueDetailView(item: item, store: store)
        }
        .sheet(item: $selectedPull) { item in
            MacPullRequestDetailView(item: item, store: store)
        }
        .sheet(isPresented: $isShowingQuickCreate) {
            DirectIssueCreateSheet(repos: store.repos) { repo, title, body, priority, labels in
                _ = try await store.createIssue(api: api, title: title, body: body, priority: priority, repo: repo, labels: labels)
                await loadPulls(refresh: true)
            } loadLabels: { repo in
                try await api.repoLabels(owner: repo.owner, repo: repo.name)
            }
        }
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(projection.subtitle)
                    .font(.macSidebar(size: 12, weight: .semibold, scale: textScale))
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("mac-today-subtitle")

                Spacer()

                Button {
                    isShowingQuickCreate = true
                } label: {
                    Label("New Issue", systemImage: "square.and.pencil")
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(store.repos.isEmpty)
                .accessibilityIdentifier("mac-today-new-issue-button")

                Button {
                    Task {
                        await store.load(api: api, refresh: true)
                        await loadPulls(refresh: true)
                    }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(store.isLoading || isLoadingPulls)
                .accessibilityLabel("Refresh Today")
                .accessibilityIdentifier("mac-today-refresh-button")
            }

            HStack(spacing: 8) {
                metric(value: projection.activeSessionCount, label: "Active", id: "mac-today-metric-sessions")
                metric(value: projection.reviewPullCount, label: "Review", id: "mac-today-metric-prs")
                metric(value: projection.issueCount, label: store.currentUserLogin == nil ? "Issues" : "Mine", id: "mac-today-metric-issues")
            }

            TextField("Search issues and PRs", text: $searchText)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("mac-today-search-field")

            if isShowingCachedData || !network.isConnected {
                Label(cacheMessage, systemImage: "wifi.slash")
                    .font(.macSidebar(size: 11, scale: textScale))
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("mac-today-cache-banner")
            }

            if let errorMessage {
                MacRecoveryBanner(
                    message: errorMessage,
                    actionTitle: "Retry",
                    isActionDisabled: isLoadingPulls
                ) {
                    Task { await loadPulls(refresh: true) }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    private func metric(value: Int, label: String, id: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(value)")
                .font(.macSidebar(size: 18, weight: .semibold, scale: textScale))
            Text(label)
                .font(.macSidebar(size: 10, scale: textScale))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 7))
        .accessibilityIdentifier(id)
    }

    private var emptyTitle: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Queue Clear" : "No Matches"
    }

    private var emptyDescription: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "No reviews, assigned issues, or active sessions need attention."
            : "No Today issues or pull requests match the current search."
    }

    private var isShowingCachedData: Bool {
        store.issuesFromCache || store.sessionsFromCache || pullsFromCache
    }

    private var cacheMessage: String {
        guard let oldest = [store.issuesCachedAt, store.sessionsCachedAt, pullsCachedAt]
            .compactMap({ $0 })
            .compactMap(parseIssueCTLDate)
            .min()
        else {
            return "Showing cached today data"
        }

        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return "Showing cached today data from \(formatter.localizedString(for: oldest, relativeTo: Date()))"
    }

    private func open(_ item: MacTodayAttentionItem) {
        switch item.kind {
        case .issue:
            selectedIssue = store.issues.first { $0.repoFullName == item.repoFullName && $0.issue.number == item.number }
        case .pull:
            selectedPull = pulls.first { $0.repoFullName == item.repoFullName && $0.pull.number == item.number }
        case .session:
            if let session = store.sessions.first(where: { $0.repoFullName == item.repoFullName && $0.issueNumber == item.number }) {
                MacTerminalWindowController.open(session: session, store: store, api: api) {}
            }
        }
    }

    private func loadPulls(refresh: Bool) async {
        guard !store.repos.isEmpty else { return }
        isLoadingPulls = true
        errorMessage = nil
        defer { isLoadingPulls = false }

        var loadedPulls: [MacPullRequestListItem] = []
        var cachedDates: [Date] = []
        var didUseCache = false
        var failures: [String] = []

        for (index, repo) in store.repos.enumerated() {
            do {
                let response = try await api.pulls(owner: repo.owner, repo: repo.name, refresh: refresh)
                loadedPulls.append(contentsOf: response.pulls.map { pull in
                    MacPullRequestListItem(pull: pull, repo: repo, repoIndex: index)
                })
                didUseCache = didUseCache || response.fromCache
                if let cachedAt = response.cachedAt, let date = parseIssueCTLDate(cachedAt) {
                    cachedDates.append(date)
                }
            } catch {
                failures.append("\(repo.fullName): \(error.localizedDescription)")
            }
        }

        pulls = loadedPulls
        pullsFromCache = didUseCache
        pullsCachedAt = cachedDates.min().map { sharedISO8601Formatter.string(from: $0) }
        if !failures.isEmpty {
            errorMessage = "Some PRs failed to load: \(failures.joined(separator: "; "))"
        }
    }
}

private struct MacTodayAttentionRow: View {
    @Environment(\.macSidebarTextScale) private var textScale

    let item: MacTodayAttentionItem

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: item.kind.iconName)
                .font(.macSidebar(size: 15, weight: .semibold, scale: textScale))
                .foregroundStyle(item.isAttention ? .orange : .secondary)
                .frame(width: 22)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(item.kind.title)
                        .font(.macSidebar(size: 10, weight: .semibold, scale: textScale))
                        .foregroundStyle(.secondary)
                    Text("\(item.repoFullName) #\(item.number)")
                        .font(.macSidebar(size: 10, scale: textScale))
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }

                Text(item.title)
                    .font(.macSidebar(size: 12, weight: .semibold, scale: textScale))
                    .foregroundStyle(.primary)
                    .lineLimit(2)

                Text(item.subtitle)
                    .font(.macSidebar(size: 10, scale: textScale))
                    .foregroundStyle(item.isAttention ? .orange : .secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 4)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
    }
}
