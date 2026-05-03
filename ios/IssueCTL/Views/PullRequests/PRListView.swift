import SwiftUI

struct PRListView: View {
    @Environment(APIClient.self) private var api
    let onShowSettings: () -> Void

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
    @State private var isSearchVisible = false
    @FocusState private var isSearchFocused: Bool
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

    private var pullRepoLookup: [String: (repo: Repo, index: Int)] {
        let reposByName = Dictionary(uniqueKeysWithValues: repos.enumerated().map { index, repo in
            (repo.fullName, (repo, index))
        })
        var lookup: [String: (repo: Repo, index: Int)] = [:]
        for (fullName, pulls) in pullsByRepo {
            guard let repoInfo = reposByName[fullName] else { continue }
            for pull in pulls {
                lookup[pull.htmlUrl] = repoInfo
            }
        }
        return lookup
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

    private var headerSubtitle: String {
        let reviewCount = sectionCounts[.review] ?? 0
        let openCount = sectionCounts[.open] ?? 0

        if reviewCount > 0 {
            return "\(reviewCount) need review • \(openCount) open"
        } else {
            return "\(openCount) open pull requests"
        }
    }

    private var hasActiveFilters: Bool {
        mineOnly || !selectedRepoIds.isEmpty || sortOrder == .created
    }

    private var filterSummaryItems: [PRFilterSummaryItem] {
        var items: [PRFilterSummaryItem] = []
        if !selectedRepoIds.isEmpty {
            items.append(PRFilterSummaryItem(title: "Repos", value: selectedRepoSummary, systemImage: "folder"))
        } else if repos.count > 1 {
            items.append(PRFilterSummaryItem(title: "Repos", value: "All \(repos.count)", systemImage: "folder"))
        }
        if mineOnly {
            items.append(PRFilterSummaryItem(title: "Scope", value: "Mine", systemImage: "person.crop.circle"))
        }
        if sortOrder == .created {
            items.append(PRFilterSummaryItem(title: "Sort", value: "Created", systemImage: "calendar"))
        }
        return items
    }

    private var selectedRepoSummary: String {
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

    private func repoIndex(for pull: GitHubPull) -> Int? {
        pullRepoLookup[pull.htmlUrl]?.index
    }

    private func repoFor(pull: GitHubPull) -> Repo? {
        pullRepoLookup[pull.htmlUrl]?.repo
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            VStack(spacing: 0) {
                if isSearchVisible {
                    prSearchBar
                } else {
                    prHeader
                }

                PRSectionPicker(selected: $section, counts: sectionCounts)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)

                Divider()

                if !filterSummaryItems.isEmpty {
                    prFilterSummary
                        .padding(.horizontal, 16)
                        .padding(.vertical, 6)

                    Divider()
                }

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
                                Text(prErrorDescription(errorMessage))
                            } actions: {
                                HStack {
                                    Button("Retry") { Task { await loadAll(refresh: true) } }
                                    Button("Open Settings", action: onShowSettings)
                                }
                            }
                            .frame(maxHeight: .infinity)
                        }
                        .refreshable { await refreshWithCooldown() }
                    } else if filteredPulls.isEmpty {
                        ScrollView {
                            ContentUnavailableView {
                                Label(emptyPullRequestTitle, systemImage: emptyPullRequestIcon)
                            } description: {
                                Text(emptyPullRequestDescription)
                            } actions: {
                                emptyPullRequestActions
                            }
                            .frame(maxHeight: .infinity)
                        }
                        .refreshable { await refreshWithCooldown() }
                    } else {
                        pullsList
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
                    sortOrder: $sortOrder,
                    mineOnly: $mineOnly,
                    mineFilterEnabled: currentUserLogin != nil && !userFetchFailed
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
            .accessibilityTabBarClearance()
        }
    }

    private var prHeader: some View {
        AppTopBar(title: "Pull Requests", subtitle: headerSubtitle) {
            HStack(spacing: 8) {
                TopBarIconButton(
                    title: "Search pull requests",
                    systemImage: "magnifyingglass",
                    accessibilityIdentifier: "prs-search-button"
                ) {
                    showSearch()
                }

                TopBarIconButton(
                    title: "Pull request filters",
                    systemImage: "line.3.horizontal.decrease",
                    accessibilityIdentifier: "prs-filter-button",
                    showsActiveIndicator: hasActiveFilters
                ) {
                    showFiltersSheet = true
                }

                TopBarIconButton(
                    title: "Create Issue",
                    systemImage: "plus",
                    accessibilityIdentifier: "prs-create-issue-button",
                    isProminent: true
                ) {
                    showCreateSheet = true
                }
            }
        }
    }

    private var prSearchBar: some View {
        HStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)

                TextField("Search pull requests", text: $searchText)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($isSearchFocused)
                    .submitLabel(.search)
                    .accessibilityIdentifier("prs-search-field")
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: 14))
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
            }

            Button("Cancel", action: hideSearch)
                .frame(minHeight: 44)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }

    private var prFilterSummary: some View {
        HStack(spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(filterSummaryItems) { item in
                        RepoContextChip(title: item.title, value: item.value, systemImage: item.systemImage)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            if hasActiveFilters {
                Button(action: resetFilters) {
                    Label("Clear", systemImage: "xmark.circle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(IssueCTLColors.action)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(IssueCTLColors.action.opacity(0.12), in: Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear pull request filters")
                .accessibilityIdentifier("prs-clear-filters-button")
            }
        }
    }

    // MARK: - List

    @ViewBuilder
    private var pullsList: some View {
        let allFiltered = filteredPulls
        let visiblePulls = Array(allFiltered.prefix(displayLimit))
        let repoLookup = pullRepoLookup
        List {
            if let actionError {
                Label(actionError, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
                    .font(.subheadline)
                    .lineLimit(3)
            }
            ForEach(visiblePulls, id: \.htmlUrl) { pull in
                let repoInfo = repoLookup[pull.htmlUrl]
                let color = repoInfo.map { RepoColors.color(for: $0.index) } ?? .secondary
                let repo = repoInfo?.repo

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
        .contentMargins(.top, 12, for: .scrollContent)
        .refreshable { await refreshWithCooldown() }
    }

    private var emptyPullRequestDescription: String {
        if !searchText.isEmpty {
            return "No \(section.rawValue) pull requests match \"\(searchText)\". Clear search to return to this section."
        }
        if hasActiveFilters {
            return "No \(section.rawValue) pull requests match the current filters. Clear filters to widen the list."
        }
        switch section {
        case .review:
            return "Nothing currently needs review attention. Check open PRs or refresh after syncing issuectl web."
        case .open:
            return "No open pull requests are visible right now. Create an issue to start new work."
        case .merged:
            return "No merged pull requests are visible in the selected repos."
        case .closed:
            return "No closed pull requests are visible in the selected repos."
        }
    }

    private var emptyPullRequestTitle: String {
        if !searchText.isEmpty { return "No Matching Pull Requests" }
        if hasActiveFilters { return "No Filtered Pull Requests" }
        switch section {
        case .review: return "No Review Work"
        case .open: return "No Open Pull Requests"
        case .merged: return "No Merged Pull Requests"
        case .closed: return "No Closed Pull Requests"
        }
    }

    private var emptyPullRequestIcon: String {
        if !searchText.isEmpty { return "magnifyingglass" }
        if hasActiveFilters { return "line.3.horizontal.decrease.circle" }
        return section.icon
    }

    private func prErrorDescription(_ message: String) -> String {
        "\(message)\n\nRetry after starting issuectl web, or open Settings to update the server."
    }

    @ViewBuilder
    private var emptyPullRequestActions: some View {
        if !searchText.isEmpty {
            Button("Clear Search", action: hideSearch)
        } else if hasActiveFilters {
            Button("Clear Filters", action: resetFilters)
        } else {
            HStack {
                Button("Create Issue") { showCreateSheet = true }
                Button("Refresh") { Task { await loadAll(refresh: true) } }
            }
        }
    }

    // MARK: - Actions

    private func showSearch() {
        isSearchVisible = true
        Task { @MainActor in
            isSearchFocused = true
        }
    }

    private func hideSearch() {
        searchText = ""
        isSearchFocused = false
        isSearchVisible = false
    }

    private func resetFilters() {
        selectedRepoIds.removeAll()
        sortOrder = .updated
        mineOnly = false
    }

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
                currentUserLogin = nil
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

private struct PRFilterSummaryItem: Identifiable {
    let title: String
    let value: String
    let systemImage: String

    var id: String { "\(title)-\(value)" }
}

private struct PRSectionPicker: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @Binding var selected: PRSection
    let counts: [PRSection: Int]

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(PRSection.allCases, id: \.self) { section in
                            sectionButton(section)
                                .frame(minWidth: 128)
                        }
                    }
                }
            } else {
                HStack(spacing: 4) {
                    ForEach(PRSection.allCases, id: \.self) { section in
                        sectionButton(section)
                    }
                }
            }
        }
        .padding(4)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius))
        .overlay {
            RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius)
                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
        }
    }

    private func sectionButton(_ section: PRSection) -> some View {
        Button {
            selected = section
        } label: {
            HStack(spacing: 4) {
                Text(section.rawValue.capitalized)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)

                Text("\(counts[section] ?? 0)")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
            }
            .font(.subheadline.bold())
            .frame(maxWidth: .infinity, minHeight: dynamicTypeSize.isAccessibilitySize ? 44 : 36)
            .padding(.horizontal, dynamicTypeSize.isAccessibilitySize ? 10 : 4)
            .background(
                selected == section ? Color.primary.opacity(0.12) : Color.clear,
                in: RoundedRectangle(cornerRadius: IssueCTLColors.controlCornerRadius)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(selected == section ? .primary : .secondary)
        .accessibilityIdentifier("section-tab-\(section.rawValue)")
        .accessibilityLabel("\(section.rawValue.capitalized), \(counts[section] ?? 0) pull requests")
    }
}

private struct PRFilterSheet: View {
    let repos: [Repo]
    @Binding var selectedRepoIds: Set<Int>
    @Binding var sortOrder: SortOrder
    @Binding var mineOnly: Bool

    let mineFilterEnabled: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    sheetHeader

                    sheetCard(title: "Repository", systemImage: "tray.2", actionTitle: selectedRepoIds.isEmpty ? nil : "Clear") {
                        selectedRepoIds.removeAll()
                    } content: {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
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

                    sheetCard(title: "Sort", systemImage: "arrow.up.arrow.down", actionTitle: sortOrder == .updated ? nil : "Reset") {
                        sortOrder = .updated
                    } content: {
                        Picker("Sort", selection: $sortOrder) {
                            Label("Updated", systemImage: "clock").tag(SortOrder.updated)
                            Label("Created", systemImage: "calendar").tag(SortOrder.created)
                        }
                        .pickerStyle(.segmented)
                    }

                    sheetCard(title: "Mine", systemImage: "person.crop.circle", actionTitle: mineOnly ? "Clear" : nil) {
                        mineOnly = false
                    } content: {
                        Toggle(isOn: $mineOnly) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Mine only")
                                    .font(.subheadline.weight(.semibold))
                                Text(mineFilterEnabled ? "Show pull requests opened by you." : "Sign in is required for this filter.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .disabled(!mineFilterEnabled)
                        .tint(IssueCTLColors.action)
                    }
                }
                .padding(16)
            }
        }
    }

    private var hasActiveFilters: Bool {
        mineOnly || !selectedRepoIds.isEmpty || sortOrder != .updated
    }

    private var sheetHeader: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Filters")
                    .font(.title3.bold())
                Text(hasActiveFilters ? "Active filters applied" : "Showing default pull request order")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if hasActiveFilters {
                Button("Reset") {
                    resetFilters()
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(IssueCTLColors.action)
                .buttonStyle(.plain)
            }
        }
    }

    private func sheetCard<Content: View>(
        title: String,
        systemImage: String,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Label(title, systemImage: systemImage)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                if let actionTitle, let action {
                    Button(actionTitle, action: action)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(IssueCTLColors.action)
                        .buttonStyle(.plain)
                }
            }
            content()
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private func optionContent(title: String, subtitle: String, isSelected: Bool) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)
            Text(subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
        .padding(10)
        .background(isSelected ? IssueCTLColors.action.opacity(0.14) : Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(isSelected ? IssueCTLColors.action.opacity(0.55) : Color.clear, lineWidth: 1)
        }
    }

    private func resetFilters() {
        selectedRepoIds.removeAll()
        sortOrder = .updated
        mineOnly = false
    }
}
