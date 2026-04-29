import SwiftUI

struct PRListView: View {
    @Environment(APIClient.self) private var api
    @State private var repos: [Repo] = []
    @State private var pullsByRepo: [String: [GitHubPull]] = [:]
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var section: PRSection = .review
    @State private var selectedRepoIds: Set<Int> = []
    @State private var sortOrder: SortOrder = .updated
    @State private var mineOnly = false
    @SceneStorage("prs.section") private var storedSection = PRSection.review.rawValue
    @SceneStorage("prs.sortOrder") private var storedSortOrder = SortOrder.updated.rawValue
    @SceneStorage("prs.mineOnly") private var storedMineOnly = false
    @State private var currentUserLogin: String?
    @State private var userFetchFailed = false
    @State private var navigationPath = NavigationPath()
    @State private var showQuickActionsSheet = false
    @State private var showCreateSheet = false
    @State private var showFiltersSheet = false

    // Swipe state
    @State private var showMergeConfirm = false
    @State private var swipeTarget: (owner: String, repo: String, number: Int)?
    @State private var actionError: String?

    @State private var oldestCachedAt: Date?
    private let pageSize = 15
    @State private var displayLimit = 15
    @State private var searchText = ""
    @State private var lastRefreshDate: Date?
    private let refreshCooldown: TimeInterval = 10

    private var repoFilteredPulls: [GitHubPull] {
        filterItemsByRepo(
            pullsByRepo,
            repos: repos,
            selectedRepoIds: selectedRepoIds,
            mineOnly: mineOnly,
            currentUserLogin: currentUserLogin,
            userLogin: { $0.user?.login }
        )
    }

    private var filteredPulls: [GitHubPull] {
        var items = repoFilteredPulls

        switch section {
        case .review: items = items.filter(\.needsReviewAttention)
        case .open: items = items.filter { $0.isOpen }
        case .merged: items = items.filter { !$0.isOpen && $0.merged }
        case .closed: items = items.filter { !$0.isOpen && !$0.merged }
        }

        if !searchText.isEmpty {
            let query = searchText.lowercased()
            items = items.filter { pull in
                pull.title.lowercased().contains(query) ||
                (pull.body ?? "").lowercased().contains(query)
            }
        }

        switch sortOrder {
        case .updated: items.sort { $0.updatedAt > $1.updatedAt }
        case .created: items.sort { $0.createdAt > $1.createdAt }
        // PRs have no priority equivalent — fall back to updated sort
        case .priority: items.sort { $0.updatedAt > $1.updatedAt }
        }

        return items
    }

    private var sectionCounts: [PRSection: Int] {
        let items = repoFilteredPulls
        return [
            .review: items.filter(\.needsReviewAttention).count,
            .open: items.filter(\.isOpen).count,
            .merged: items.filter { !$0.isOpen && $0.merged }.count,
            .closed: items.filter { !$0.isOpen && !$0.merged }.count,
        ]
    }

    private func repoIndex(for pull: GitHubPull) -> Int? {
        repoIndexForItem(pull, in: pullsByRepo, repos: repos, htmlUrl: { $0.htmlUrl })
    }

    private func repoFor(pull: GitHubPull) -> Repo? {
        repoForItem(pull, in: pullsByRepo, repos: repos, htmlUrl: { $0.htmlUrl })
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            VStack(spacing: 0) {
                SectionTabs(selected: $section, counts: sectionCounts)
                    .padding(.vertical, 8)

                Divider()

                if let oldestCachedAt {
                    CacheAgeLabel(date: oldestCachedAt)
                        .padding(.horizontal, 16)
                        .padding(.top, 4)
                }

                Group {
                    if isLoading && pullsByRepo.isEmpty {
                        ProgressView("Loading pull requests...")
                            .frame(maxHeight: .infinity)
                    } else if let errorMessage {
                        ScrollView {
                            ContentUnavailableView {
                                Label("Error", systemImage: "exclamationmark.triangle")
                            } description: {
                                Text(errorMessage)
                            } actions: {
                                Button("Retry") { Task { await loadAll() } }
                            }
                            .frame(maxHeight: .infinity)
                        }
                        .refreshable { await refreshWithCooldown() }
                    } else if filteredPulls.isEmpty {
                        ScrollView {
                            ContentUnavailableView(
                                "No Pull Requests",
                                systemImage: "arrow.triangle.merge",
                                description: Text("No \(section.rawValue) pull requests.")
                            )
                            .frame(maxHeight: .infinity)
                        }
                        .refreshable { await refreshWithCooldown() }
                    } else {
                        pullsList
                    }
                }
            }
            .navigationTitle("Pull Requests")
            .navigationDestination(for: PRDestination.self) { dest in
                PRDetailView(owner: dest.owner, repo: dest.repo, number: dest.number)
            }
            .confirmationDialog("Merge Pull Request", isPresented: $showMergeConfirm, titleVisibility: .visible) {
                Button("Squash & Merge") {
                    if let target = swipeTarget {
                        Task { await mergePull(owner: target.owner, repo: target.repo, number: target.number, strategy: "squash") }
                    }
                }
                Button("Merge Commit") {
                    if let target = swipeTarget {
                        Task { await mergePull(owner: target.owner, repo: target.repo, number: target.number, strategy: "merge") }
                    }
                }
                Button("Rebase") {
                    if let target = swipeTarget {
                        Task { await mergePull(owner: target.owner, repo: target.repo, number: target.number, strategy: "rebase") }
                    }
                }
            }
            .sheet(isPresented: $showQuickActionsSheet) {
                PRQuickActionsSheet(
                    mineOnly: $mineOnly,
                    mineFilterEnabled: currentUserLogin != nil && !userFetchFailed,
                    reviewCount: sectionCounts[.review] ?? 0,
                    openCount: sectionCounts[.open] ?? 0,
                    mergedCount: sectionCounts[.merged] ?? 0,
                    closedCount: sectionCounts[.closed] ?? 0,
                    onCreateIssue: {
                        showQuickActionsSheet = false
                        showCreateSheet = true
                    },
                    onShowReview: {
                        section = .review
                        showQuickActionsSheet = false
                    },
                    onShowOpen: {
                        section = .open
                        showQuickActionsSheet = false
                    },
                    onShowMerged: {
                        section = .merged
                        showQuickActionsSheet = false
                    },
                    onShowClosed: {
                        section = .closed
                        showQuickActionsSheet = false
                    },
                    onRefresh: {
                        showQuickActionsSheet = false
                        Task { await refreshWithCooldown() }
                    }
                )
                .presentationDetents([.height(360), .medium])
                .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showCreateSheet) {
                QuickCreateSheet(repos: repos, onSuccess: { warning in
                    if let warning { actionError = warning }
                    Task { await loadAll(refresh: true) }
                })
            }
            .sheet(isPresented: $showFiltersSheet) {
                PRFilterSheet(
                    repos: repos,
                    selectedRepoIds: $selectedRepoIds,
                    section: $section,
                    sortOrder: $sortOrder,
                    mineOnly: $mineOnly,
                    mineFilterEnabled: currentUserLogin != nil && !userFetchFailed,
                    sectionCounts: sectionCounts
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .autoDismissError($actionError)
            .task { await loadAll() }
            .onAppear {
                if let s = PRSection(rawValue: storedSection) { section = s }
                if let s = SortOrder(rawValue: storedSortOrder) { sortOrder = s }
                mineOnly = storedMineOnly
            }
            .onChange(of: section) { _, new in
                displayLimit = pageSize
                storedSection = new.rawValue
            }
            .onChange(of: selectedRepoIds) { _, _ in displayLimit = pageSize }
            .onChange(of: sortOrder) { _, new in
                displayLimit = pageSize
                storedSortOrder = new.rawValue
            }
            .onChange(of: mineOnly) { _, new in
                displayLimit = pageSize
                storedMineOnly = new
            }
            .onChange(of: searchText) { _, _ in displayLimit = pageSize }
            .interactivePopDisabled(isAtRoot: navigationPath.isEmpty)
            .safeAreaInset(edge: .bottom) {
                pullRequestThumbBar
            }
        }
        .searchable(text: $searchText, prompt: "Search pull requests")
    }

    private var pullRequestThumbBar: some View {
        ThumbActionBar {
            Button {
                showQuickActionsSheet = true
            } label: {
                Label("Quick Actions", systemImage: "bolt.fill")
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(IssueCTLColors.action)
        } secondary: {
            Button {
                showFiltersSheet = true
            } label: {
                Image(systemName: "line.3.horizontal.decrease")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 44, height: 36)
            }
            .buttonStyle(.bordered)
            .accessibilityLabel("Pull request filters")
        }
        .padding(.bottom, 4)
    }

    // MARK: - List

    @ViewBuilder
    private var pullsList: some View {
        let allFiltered = filteredPulls
        let visiblePulls = Array(allFiltered.prefix(displayLimit))
        List {
            if let actionError {
                Label(actionError, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
                    .font(.subheadline)
                    .lineLimit(3)
            }
            ForEach(visiblePulls, id: \.htmlUrl) { pull in
                let color = repoIndex(for: pull).map { RepoColors.color(for: $0) } ?? .secondary
                let repo = repoFor(pull: pull)

                if let repo {
                    NavigationLink(value: PRDestination(
                        owner: repo.owner,
                        repo: repo.name,
                        number: pull.number
                    )) {
                        PRRowView(pull: pull, repoColor: color)
                    }
                    .accessibilityIdentifier("pr-row-\(pull.number)")
                    .swipeActions(edge: .leading, allowsFullSwipe: false) {
                        if pull.isOpen {
                            Button {
                                swipeTarget = (repo.owner, repo.name, pull.number)
                                showMergeConfirm = true
                            } label: {
                                Label("Merge", systemImage: "arrow.triangle.merge")
                            }
                            .tint(.green)
                        }
                    }
                }
            }

            LoadMoreButton(totalCount: allFiltered.count, displayLimit: $displayLimit, pageSize: pageSize)
        }
        .refreshable { await refreshWithCooldown() }
    }

    // MARK: - Actions

    private func mergePull(owner: String, repo: String, number: Int, strategy: String) async {
        actionError = nil
        do {
            let body = MergeRequestBody(mergeMethod: strategy)
            let response = try await api.mergePull(owner: owner, repo: repo, number: number, body: body)
            if response.success {
                await loadAll(refresh: true)
            } else {
                actionError = response.error ?? "Failed to merge"
            }
        } catch {
            actionError = error.localizedDescription
        }
    }

    // MARK: - Loading

    private func loadAll(refresh: Bool = false) async {
        isLoading = true
        errorMessage = nil
        actionError = nil
        do {
            repos = try await api.repos()

            // Fetch current user for "mine" filter — failure is non-fatal
            var failures: [String] = []
            do {
                let user = try await api.currentUser()
                currentUserLogin = user.login
                userFetchFailed = false
            } catch {
                userFetchFailed = true
                failures.append("user profile (\(error.localizedDescription))")
            }

            let repoResults = await withTaskGroup(of: (String, String, [GitHubPull]?, String?, Error?).self) { group in
                for repo in repos {
                    group.addTask {
                        do {
                            let response = try await api.pulls(owner: repo.owner, repo: repo.name, refresh: refresh)
                            return (repo.fullName, repo.name, response.pulls, response.cachedAt, nil)
                        } catch {
                            return (repo.fullName, repo.name, nil, nil, error)
                        }
                    }
                }
                var collected: [(String, String, [GitHubPull]?, String?, Error?)] = []
                for await result in group {
                    collected.append(result)
                }
                return collected
            }
            var cachedDates: [Date] = []
            var nextPullsByRepo: [String: [GitHubPull]] = [:]
            for (fullName, name, pulls, cachedAt, error) in repoResults {
                if let pulls {
                    nextPullsByRepo[fullName] = pulls
                    if let cachedAt, let date = sharedISO8601Formatter.date(from: cachedAt) {
                        cachedDates.append(date)
                    }
                } else if let error {
                    failures.append("\(name) (\(error.localizedDescription))")
                } else {
                    failures.append(name)
                }
            }
            pullsByRepo = nextPullsByRepo
            oldestCachedAt = cachedDates.min()
            if !failures.isEmpty {
                actionError = "Failed to load: \(failures.joined(separator: ", "))"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func refreshWithCooldown() async {
        guard shouldAllowRefresh(lastRefreshDate: lastRefreshDate, cooldown: refreshCooldown) else {
            return
        }
        lastRefreshDate = Date()
        await loadAll(refresh: true)
    }
}

struct PRDestination: Hashable {
    let owner: String
    let repo: String
    let number: Int
}

private struct PRQuickActionsSheet: View {
    @Binding var mineOnly: Bool

    let mineFilterEnabled: Bool
    let reviewCount: Int
    let openCount: Int
    let mergedCount: Int
    let closedCount: Int
    let onCreateIssue: () -> Void
    let onShowReview: () -> Void
    let onShowOpen: () -> Void
    let onShowMerged: () -> Void
    let onShowClosed: () -> Void
    let onRefresh: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Quick Actions")
                        .font(.title2.weight(.bold))
                    Text("\(reviewCount) need review, \(openCount) open")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 0) {
                    sheetAction(
                        title: "Create Issue",
                        subtitle: "Capture follow-up work from PR review.",
                        systemImage: "plus.circle",
                        action: onCreateIssue
                    )

                    Divider()

                    sheetAction(
                        title: "Refresh Pull Requests",
                        subtitle: "Fetch the latest PR state.",
                        systemImage: "arrow.clockwise",
                        action: onRefresh
                    )
                }
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))

                VStack(spacing: 0) {
                    sheetAction(
                        title: "Review Queue",
                        subtitle: "\(reviewCount) PRs need attention",
                        systemImage: "exclamationmark.bubble",
                        action: onShowReview
                    )

                    Divider()

                    sheetAction(
                        title: "Open PRs",
                        subtitle: "\(openCount) currently open",
                        systemImage: "arrow.triangle.merge",
                        action: onShowOpen
                    )

                    Divider()

                    sheetAction(
                        title: "Merged PRs",
                        subtitle: "\(mergedCount) merged",
                        systemImage: "checkmark.seal",
                        action: onShowMerged
                    )

                    Divider()

                    sheetAction(
                        title: "Closed PRs",
                        subtitle: "\(closedCount) closed without merge",
                        systemImage: "checkmark.circle",
                        action: onShowClosed
                    )

                    Divider()

                    Toggle(isOn: $mineOnly) {
                        HStack(spacing: 12) {
                            Image(systemName: "person.crop.circle")
                                .frame(width: 26)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Mine Only")
                                    .font(.subheadline.weight(.semibold))
                                Text(mineFilterEnabled ? "Assigned to your GitHub login." : "User profile unavailable.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .disabled(!mineFilterEnabled)
                    .padding(12)
                }
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.top, 24)
            .padding(.bottom, 16)
        }
    }

    private func sheetAction(
        title: String,
        subtitle: String,
        systemImage: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .frame(width: 26)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tertiary)
            }
            .padding(12)
        }
        .buttonStyle(.plain)
    }
}

private struct PRFilterSheet: View {
    let repos: [Repo]
    @Binding var selectedRepoIds: Set<Int>
    @Binding var section: PRSection
    @Binding var sortOrder: SortOrder
    @Binding var mineOnly: Bool

    let mineFilterEnabled: Bool
    let sectionCounts: [PRSection: Int]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Filter & Sort")
                            .font(.title2.weight(.bold))
                        Text("\(sectionCounts[section] ?? 0) \(section.rawValue) PRs")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    sheetCard(title: "Status") {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                            ForEach(PRSection.allCases, id: \.self) { option in
                                filterOption(
                                    title: option.rawValue.capitalized,
                                    subtitle: "\(sectionCounts[option] ?? 0) PRs",
                                    isSelected: section == option
                                ) {
                                    section = option
                                }
                            }
                        }
                    }

                    sheetCard(title: "Repository") {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                            Button {
                                selectedRepoIds.removeAll()
                            } label: {
                                optionContent(title: "All Repos", subtitle: "\(repos.count) configured", isSelected: selectedRepoIds.isEmpty)
                            }
                            .buttonStyle(.plain)

                            ForEach(repos) { repo in
                                let isSelected = selectedRepoIds.contains(repo.id)
                                Button {
                                    if isSelected {
                                        selectedRepoIds.remove(repo.id)
                                    } else {
                                        selectedRepoIds.insert(repo.id)
                                    }
                                } label: {
                                    optionContent(title: repo.name, subtitle: repo.owner, isSelected: isSelected)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    sheetCard(title: "Sort") {
                        Picker("Sort", selection: $sortOrder) {
                            Label("Updated", systemImage: "clock").tag(SortOrder.updated)
                            Label("Created", systemImage: "calendar").tag(SortOrder.created)
                        }
                        .pickerStyle(.segmented)
                    }

                    Toggle(isOn: $mineOnly) {
                        Label("Mine Only", systemImage: "person.crop.circle")
                            .font(.subheadline.weight(.semibold))
                    }
                    .disabled(!mineFilterEnabled)
                    .padding(12)
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
                }
                .padding(16)
            }
        }
    }

    private func sheetCard<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            content()
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private func filterOption(title: String, subtitle: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            optionContent(title: title, subtitle: subtitle, isSelected: isSelected)
        }
        .buttonStyle(.plain)
    }

    private func optionContent(title: String, subtitle: String, isSelected: Bool) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)
            Text(subtitle)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, minHeight: 54, alignment: .leading)
        .padding(10)
        .background(isSelected ? IssueCTLColors.action.opacity(0.14) : Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(isSelected ? IssueCTLColors.action.opacity(0.55) : Color.clear, lineWidth: 1)
        }
    }
}
