import SwiftUI

struct PRListView: View {
    @Environment(APIClient.self) private var api
    @State private var repos: [Repo] = []
    @State private var pullsByRepo: [String: [GitHubPull]] = [:]
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var section: PRSection = .open
    @State private var selectedRepoIds: Set<Int> = []
    @State private var sortOrder: SortOrder = .updated
    @State private var mineOnly = false
    @SceneStorage("prs.section") private var storedSection = PRSection.open.rawValue
    @SceneStorage("prs.sortOrder") private var storedSortOrder = SortOrder.updated.rawValue
    @SceneStorage("prs.mineOnly") private var storedMineOnly = false
    @State private var currentUserLogin: String?
    @State private var userFetchFailed = false
    @State private var navigationPath = NavigationPath()

    // Swipe state
    @State private var showMergeConfirm = false
    @State private var swipeTarget: (owner: String, repo: String, number: Int)?
    @State private var actionError: String?
    @State private var errorDismissTask: Task<Void, Never>?

    @State private var oldestCachedAt: Date?
    private let pageSize = 15
    @State private var displayLimit = 15
    @State private var lastRefreshDate: Date?
    private let refreshCooldown: TimeInterval = 10

    private var allPulls: [GitHubPull] {
        pullsByRepo.values.flatMap { $0 }
    }

    // Pulls filtered by selected repos and "mine" toggle (before section/sort filtering)
    private var repoFilteredPulls: [GitHubPull] {
        var items: [GitHubPull]
        if selectedRepoIds.isEmpty {
            items = allPulls
        } else {
            let selectedRepoNames = Set(repos.filter { selectedRepoIds.contains($0.id) }.map(\.fullName))
            items = pullsByRepo
                .filter { selectedRepoNames.contains($0.key) }
                .values.flatMap { $0 }
        }
        if mineOnly, let login = currentUserLogin {
            items = items.filter { $0.user?.login == login }
        }
        return items
    }

    private var filteredPulls: [GitHubPull] {
        var items = repoFilteredPulls

        switch section {
        case .open: items = items.filter { $0.isOpen }
        case .closed: items = items.filter { !$0.isOpen }
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
            .open: items.filter(\.isOpen).count,
            .closed: items.filter { !$0.isOpen }.count,
        ]
    }

    private func repoIndex(for pull: GitHubPull) -> Int? {
        for (repoFullName, pulls) in pullsByRepo {
            if pulls.contains(where: { $0.htmlUrl == pull.htmlUrl }) {
                return repos.firstIndex(where: { $0.fullName == repoFullName })
            }
        }
        return nil
    }

    private func repoFor(pull: GitHubPull) -> Repo? {
        for (repoFullName, pulls) in pullsByRepo {
            if pulls.contains(where: { $0.htmlUrl == pull.htmlUrl }) {
                return repos.first(where: { $0.fullName == repoFullName })
            }
        }
        return nil
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            VStack(spacing: 0) {
                SectionTabs(selected: $section, counts: sectionCounts)
                    .padding(.vertical, 8)

                HStack(spacing: 0) {
                    RepoFilterChips(repos: repos, selectedRepoIds: $selectedRepoIds)
                    MineFilterChip(isOn: $mineOnly, isAvailable: currentUserLogin != nil, isDisabled: userFetchFailed)
                        .padding(.trailing, 16)
                }
                .padding(.bottom, 8)

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
                        ContentUnavailableView {
                            Label("Error", systemImage: "exclamationmark.triangle")
                        } description: {
                            Text(errorMessage)
                        } actions: {
                            Button("Retry") { Task { await loadAll() } }
                        }
                    } else if filteredPulls.isEmpty {
                        ContentUnavailableView(
                            "No Pull Requests",
                            systemImage: "arrow.triangle.merge",
                            description: Text("No \(section.rawValue) pull requests.")
                        )
                    } else {
                        pullsList
                    }
                }
            }
            .navigationTitle("Pull Requests")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Sort", selection: $sortOrder) {
                            Label("Updated", systemImage: "clock").tag(SortOrder.updated)
                            Label("Created", systemImage: "calendar").tag(SortOrder.created)
                        }
                    } label: {
                        Image(systemName: "arrow.up.arrow.down")
                    }
                }
            }
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
            .onChange(of: actionError) { _, newValue in
                errorDismissTask?.cancel()
                if newValue != nil {
                    errorDismissTask = Task {
                        try? await Task.sleep(for: .seconds(5))
                        if !Task.isCancelled {
                            actionError = nil
                        }
                    }
                }
            }
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
            .interactivePopDisabled(isAtRoot: navigationPath.isEmpty)
        }
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

            if allFiltered.count > displayLimit {
                Button {
                    displayLimit += pageSize
                } label: {
                    Text("Load More (\(allFiltered.count - displayLimit) remaining)")
                        .font(.subheadline)
                        .frame(maxWidth: .infinity)
                }
            }
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

            var cachedDates: [Date] = []
            let isoFormatter = ISO8601DateFormatter()

            await withTaskGroup(of: (String, String, [GitHubPull]?, String?, Error?).self) { group in
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
                for await (fullName, name, pulls, cachedAt, error) in group {
                    if let pulls {
                        pullsByRepo[fullName] = pulls
                        if let cachedAt, let date = isoFormatter.date(from: cachedAt) {
                            cachedDates.append(date)
                        }
                    } else if let error {
                        failures.append("\(name) (\(error.localizedDescription))")
                    } else {
                        failures.append(name)
                    }
                }
            }
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
        if let last = lastRefreshDate, Date().timeIntervalSince(last) < refreshCooldown {
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
