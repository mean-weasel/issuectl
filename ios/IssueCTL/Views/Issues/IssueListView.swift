import SwiftUI

struct IssueListView: View {
    @Environment(APIClient.self) private var api
    @Environment(NetworkMonitor.self) private var network
    @Environment(OfflineSyncService.self) private var offlineSync
    let onShowSettings: () -> Void

    @State private var repos: [Repo] = []
    @State private var issuesByRepo: [String: [GitHubIssue]] = [:]
    @State private var issueRepoLookup: [String: (repo: Repo, index: Int)] = [:]
    @State private var drafts: [Draft] = []
    @State private var activeDeployments: [ActiveDeployment] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var section: IssueSection = .open
    @State private var selectedRepoIds: Set<Int> = []
    @State private var sortOrder: SortOrder = .updated
    @State private var mineOnly = false
    @SceneStorage("issues.section") private var storedSection = IssueSection.open.rawValue
    @SceneStorage("issues.sortOrder") private var storedSortOrder = SortOrder.updated.rawValue
    @SceneStorage("issues.mineOnly") private var storedMineOnly = false
    @State private var showCreateSheet = false
    @State private var showParseSheet = false
    @State private var showFiltersSheet = false
    @State private var currentUserLogin: String?
    @State private var userFetchFailed = false
    @State private var navigationPath = NavigationPath()

    // Swipe action state
    @State private var showCloseConfirm = false
    @State private var showReopenConfirm = false
    @State private var swipeTarget: (owner: String, repo: String, number: Int)?
    @State private var launchTarget: LaunchTarget?
    @State private var terminalTarget: ActiveDeployment?
    @State private var loadingLaunchTargetId: String?

    // Draft swipe state
    @State private var showDeleteDraftConfirm = false
    @State private var deleteDraftTarget: String?

    @State private var actionError: String?

    // Priority data keyed by "owner/repo#number"
    @State private var priorities: [String: Priority] = [:]
    @State private var isLoadingPriorities = false

    @State private var oldestCachedAt: Date?
    @State private var isShowingCachedData = false
    private let pageSize = 15
    @State private var displayLimit = 15
    @State private var searchText = ""
    @State private var isSearchVisible = false
    @FocusState private var isSearchFocused: Bool
    @State private var lastRefreshDate: Date?
    private let refreshCooldown: TimeInterval = 10
    private typealias RepoIssueLoadResult = (fullName: String, name: String, issues: [GitHubIssue]?, cachedAt: String?, fromCache: Bool, error: Error?)

    private func isRunning(_ issue: GitHubIssue, in repoFullName: String) -> Bool {
        runningDeployment(for: issue, in: repoFullName, deployments: activeDeployments) != nil
    }

    private var repoFilteredIssues: [GitHubIssue] {
        filterItemsByRepo(
            issuesByRepo,
            repos: repos,
            selectedRepoIds: selectedRepoIds,
            mineOnly: mineOnly,
            currentUserLogin: currentUserLogin,
            userLogin: { $0.user?.login }
        )
    }

    private var filteredIssues: [GitHubIssue] {
        var items = repoFilteredIssues
        let repoLookup = issueRepoLookup

        switch section {
        case .drafts: return []
        case .open: items = items.filter { issue in
            guard let repo = repoLookup[issue.htmlUrl]?.repo else { return issue.isOpen }
            return issue.isOpen && !isRunning(issue, in: repo.fullName)
        }
        case .running: items = items.filter { issue in
            guard let repo = repoLookup[issue.htmlUrl]?.repo else { return false }
            return issue.isOpen && isRunning(issue, in: repo.fullName)
        }
        case .unassigned: items = items.filter { issue in
            issue.isOpen && (issue.assignees ?? []).isEmpty
        }
        case .closed: items = items.filter { !$0.isOpen }
        }

        if !searchText.isEmpty {
            let query = searchText.lowercased()
            items = items.filter { issue in
                issue.title.lowercased().contains(query) ||
                (issue.body ?? "").lowercased().contains(query)
            }
        }

        switch sortOrder {
        case .updated: items.sort { $0.updatedAt > $1.updatedAt }
        case .created: items.sort { $0.createdAt > $1.createdAt }
        case .priority: items.sort { prioritySortIndex(for: $0) < prioritySortIndex(for: $1) }
        }

        return items
    }

    /// Returns a sort index for priority sorting (high=0, normal=1, low=2).
    private func prioritySortIndex(for issue: GitHubIssue) -> Int {
        guard let repo = repoFor(issue: issue) else { return Priority.normal.sortIndex }
        let key = "\(repo.owner)/\(repo.name)#\(issue.number)"
        return (priorities[key] ?? .normal).sortIndex
    }

    private var sectionCounts: [IssueSection: Int] {
        let items = repoFilteredIssues
        let repoLookup = issueRepoLookup
        let open = items.filter { issue in
            guard let repo = repoLookup[issue.htmlUrl]?.repo else { return issue.isOpen }
            return issue.isOpen && !isRunning(issue, in: repo.fullName)
        }
        let running = items.filter { issue in
            guard let repo = repoLookup[issue.htmlUrl]?.repo else { return false }
            return issue.isOpen && isRunning(issue, in: repo.fullName)
        }
        let unassigned = items.filter { issue in
            issue.isOpen && (issue.assignees ?? []).isEmpty
        }
        let closed = items.filter { !$0.isOpen }
        return [
            .drafts: drafts.count,
            .open: open.count,
            .running: running.count,
            .unassigned: unassigned.count,
            .closed: closed.count,
        ]
    }

    private var headerSubtitle: String {
        let openCount = sectionCounts[.open] ?? 0
        let runningCount = sectionCounts[.running] ?? 0
        let draftCount = sectionCounts[.drafts] ?? 0

        if runningCount > 0 {
            return "\(runningCount) running • \(openCount) open"
        } else if draftCount > 0 {
            return "\(openCount) open • \(draftCount) drafts"
        } else {
            return "\(openCount) open issues"
        }
    }

    private var hasActiveFilters: Bool {
        mineOnly || !selectedRepoIds.isEmpty || sortOrder != .updated
    }

    private var filterSummaryItems: [IssueFilterSummaryItem] {
        var items: [IssueFilterSummaryItem] = []
        if !selectedRepoIds.isEmpty {
            items.append(IssueFilterSummaryItem(title: "Repos", value: selectedRepoSummary, systemImage: "folder"))
        } else if repos.count > 1 {
            items.append(IssueFilterSummaryItem(title: "Repos", value: "All \(repos.count)", systemImage: "folder"))
        }
        if mineOnly {
            items.append(IssueFilterSummaryItem(title: "Scope", value: "Mine", systemImage: "person.crop.circle"))
        }
        switch sortOrder {
        case .updated:
            break
        case .created:
            items.append(IssueFilterSummaryItem(title: "Sort", value: "Created", systemImage: "calendar"))
        case .priority:
            items.append(IssueFilterSummaryItem(title: "Sort", value: "Priority", systemImage: "arrow.up.arrow.down"))
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

    private var filteredDrafts: [Draft] {
        guard !searchText.isEmpty else { return drafts }
        let query = searchText.lowercased()
        return drafts.filter { draft in
            draft.title.lowercased().contains(query) ||
            (draft.body ?? "").lowercased().contains(query)
        }
    }

    private func repoIndex(for issue: GitHubIssue) -> Int? {
        issueRepoLookup[issue.htmlUrl]?.index
    }

    private func repoFor(issue: GitHubIssue) -> Repo? {
        issueRepoLookup[issue.htmlUrl]?.repo
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            VStack(spacing: 0) {
                if isSearchVisible {
                    issueSearchBar
                } else {
                    issueHeader
                }

                IssueSectionPicker(selected: $section, counts: sectionCounts)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)

                Divider()

                if !filterSummaryItems.isEmpty {
                    issueFilterSummary
                        .padding(.horizontal, 16)
                        .padding(.vertical, 6)

                    Divider()
                }

                if isShowingCachedData {
                    OfflineStatusBanner(message: staleDataMessage(kind: "issues", cachedAt: oldestCachedAt))
                        .padding(.horizontal, 16)
                        .padding(.top, 6)
                } else if let oldestCachedAt {
                    CacheAgeLabel(date: oldestCachedAt)
                        .padding(.horizontal, 16)
                        .padding(.top, 4)
                }

                Group {
                    if isLoading && issuesByRepo.isEmpty && drafts.isEmpty {
                        ProgressView("Loading issues...")
                            .frame(maxHeight: .infinity)
                    } else if let errorMessage {
                        ScrollView {
                            ContentUnavailableView {
                                Label("Error", systemImage: "exclamationmark.triangle")
                            } description: {
                                Text(issueErrorDescription(errorMessage))
                            } actions: {
                                HStack {
                                    Button("Retry") { Task { await loadAll(refresh: true) } }
                                    Button("Open Settings", action: onShowSettings)
                                }
                            }
                            .frame(maxHeight: .infinity)
                        }
                        .refreshable { await refreshWithCooldown() }
                    } else if section == .drafts {
                        draftsList
                    } else if filteredIssues.isEmpty {
                        ScrollView {
                            ContentUnavailableView {
                                Label(emptyIssueTitle, systemImage: emptyIssueIcon)
                            } description: {
                                Text(emptyIssueDescription)
                            } actions: {
                                emptyIssueActions
                            }
                            .frame(maxHeight: .infinity)
                        }
                        .refreshable { await refreshWithCooldown() }
                    } else {
                        issuesList
                    }
                }
            }
            .navigationDestination(for: IssueDestination.self) { dest in
                IssueDetailView(
                    owner: dest.owner,
                    repo: dest.repo,
                    number: dest.number,
                    initialIssue: dest.initialIssue
                )
            }
            .navigationDestination(for: DraftDestination.self) { dest in
                DraftDetailView(draft: dest.draft, onSaved: { Task { await loadAll(refresh: true) } })
            }
            .sheet(isPresented: $showCreateSheet) {
                QuickCreateSheet(repos: repos, onSuccess: { warning in
                    if let warning { actionError = warning }
                    Task { await loadAll(refresh: true) }
                })
            }
            .sheet(isPresented: $showParseSheet) {
                ParseView()
            }
            .sheet(isPresented: $showFiltersSheet) {
                IssueFilterSheet(
                    repos: repos,
                    selectedRepoIds: $selectedRepoIds,
                    sortOrder: $sortOrder,
                    mineOnly: $mineOnly,
                    mineFilterEnabled: currentUserLogin != nil && !userFetchFailed,
                    onParseWithAI: {
                        showFiltersSheet = false
                        showParseSheet = true
                    }
                )
                .presentationDetents([.fraction(0.66), .large])
                .presentationDragIndicator(.visible)
            }
            .sheet(item: $launchTarget) { target in
                LaunchView(
                    owner: target.owner,
                    repo: target.repo,
                    issueNumber: target.number,
                    issueTitle: target.title,
                    comments: target.comments,
                    referencedFiles: target.referencedFiles
                ) { deployment in
                    activeDeployments.removeAll { $0.id == deployment.id }
                    activeDeployments.append(deployment)
                }
                .presentationDetents([.fraction(0.66), .large])
                .presentationDragIndicator(.visible)
            }
            .fullScreenCover(item: $terminalTarget, onDismiss: {
                terminalTarget = nil
            }) { deployment in
                if let port = deployment.ttydPort {
                    TerminalView(
                        deployment: deployment,
                        port: port,
                        onClose: {
                            terminalTarget = nil
                        },
                        onEnd: {
                            terminalTarget = nil
                            activeDeployments.removeAll { $0.id == deployment.id }
                            Task { await loadAll(refresh: true) }
                        }
                    )
                }
            }
            .confirmationDialog("Close Issue", isPresented: $showCloseConfirm, titleVisibility: .visible) {
                Button("Close", role: .destructive) {
                    if let target = swipeTarget {
                        Task { await updateIssueState(owner: target.owner, repo: target.repo, number: target.number, state: "closed") }
                    }
                }
            }
            .confirmationDialog("Reopen Issue", isPresented: $showReopenConfirm, titleVisibility: .visible) {
                Button("Reopen") {
                    if let target = swipeTarget {
                        Task { await updateIssueState(owner: target.owner, repo: target.repo, number: target.number, state: "open") }
                    }
                }
            }
            .confirmationDialog("Delete Draft", isPresented: $showDeleteDraftConfirm, titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let draftId = deleteDraftTarget {
                        Task { await deleteDraft(id: draftId) }
                    }
                }
            }
            .autoDismissError($actionError)
            .task { await loadAll() }
            .onAppear {
                if let s = IssueSection(rawValue: storedSection) { section = s }
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

    private var issueHeader: some View {
        AppTopBar(title: "Issues", subtitle: headerSubtitle) {
            HStack(spacing: 8) {
                TopBarIconButton(
                    title: "Parse with AI",
                    systemImage: "text.viewfinder",
                    accessibilityIdentifier: "issues-parse-ai-button"
                ) {
                    showParseSheet = true
                }

                TopBarIconButton(
                    title: "Search issues",
                    systemImage: "magnifyingglass",
                    accessibilityIdentifier: "issues-search-button"
                ) {
                    showSearch()
                }

                TopBarIconButton(
                    title: "Issue filters",
                    systemImage: "line.3.horizontal.decrease",
                    accessibilityIdentifier: "issues-filter-button",
                    showsActiveIndicator: hasActiveFilters
                ) {
                    showFiltersSheet = true
                }

                TopBarIconButton(
                    title: "Create Issue",
                    systemImage: "plus",
                    accessibilityIdentifier: "issues-create-issue-button",
                    isProminent: true
                ) {
                    showCreateSheet = true
                }
            }
        }
    }

    private var issueSearchBar: some View {
        HStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)

                TextField("Search issues", text: $searchText)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($isSearchFocused)
                    .submitLabel(.search)
                    .accessibilityIdentifier("issues-search-field")
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

    private var issueFilterSummary: some View {
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
                .accessibilityLabel("Clear issue filters")
                .accessibilityIdentifier("issues-clear-filters-button")
            }
        }
    }

    // MARK: - Lists

    @ViewBuilder
    private var issuesList: some View {
        let allFiltered = filteredIssues
        let visibleIssues = Array(allFiltered.prefix(displayLimit))
        let repoLookup = issueRepoLookup
        List {
            if let actionError {
                Label(actionError, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
                    .font(.subheadline)
                    .lineLimit(3)
            }
            ForEach(visibleIssues, id: \.htmlUrl) { issue in
                let repoInfo = repoLookup[issue.htmlUrl]
                let color = repoInfo.map { RepoColors.color(for: $0.index) } ?? .secondary
                let repo = repoInfo?.repo
                let running = repo.map { isRunning(issue, in: $0.fullName) } ?? false

                if let repo {
                    NavigationLink(value: IssueDestination(
                        owner: repo.owner,
                        repo: repo.name,
                        number: issue.number,
                        initialIssue: issue
                    )) {
                        IssueRowView(issue: issue, repoColor: color, isRunning: running)
                    }
                    .accessibilityIdentifier("issue-row-\(issue.number)")
                    .swipeActions(edge: .leading, allowsFullSwipe: false) {
                        if issue.isOpen {
                            if let deployment = runningDeployment(for: issue, in: repo.fullName, deployments: activeDeployments) {
                                Button {
                                    if deployment.ttydPort != nil {
                                        terminalTarget = deployment
                                    } else {
                                        actionError = "Session is running, but its terminal is not ready yet."
                                    }
                                } label: {
                                    Label("Terminal", systemImage: "terminal")
                                }
                                .tint(.blue)
                            } else {
                                Button {
                                    Task {
                                        await prepareLaunch(owner: repo.owner, repo: repo.name, number: issue.number, title: issue.title)
                                    }
                                } label: {
                                    if loadingLaunchTargetId == "\(repo.owner)/\(repo.name)#\(issue.number)" {
                                        Label("Loading", systemImage: "hourglass")
                                    } else {
                                        Label("Launch", systemImage: "play.fill")
                                    }
                                }
                                .tint(.green)
                            }
                        } else {
                            Button {
                                swipeTarget = (repo.owner, repo.name, issue.number)
                                showReopenConfirm = true
                            } label: {
                                Label("Reopen", systemImage: "arrow.uturn.backward.circle")
                            }
                            .tint(.green)
                        }
                    }
                    .swipeActions(edge: .trailing) {
                        if issue.isOpen {
                            Button(role: .destructive) {
                                swipeTarget = (repo.owner, repo.name, issue.number)
                                showCloseConfirm = true
                            } label: {
                                Label("Close", systemImage: "xmark.circle")
                            }
                        }
                    }
                }
            }

            LoadMoreButton(totalCount: allFiltered.count, displayLimit: $displayLimit, pageSize: pageSize)
        }
        .contentMargins(.top, 12, for: .scrollContent)
        .refreshable { await refreshWithCooldown() }
    }

    @ViewBuilder
    private var draftsList: some View {
        if filteredDrafts.isEmpty {
            ScrollView {
                ContentUnavailableView {
                    Label("No Drafts", systemImage: "doc.text")
                } description: {
                    Text(emptyDraftDescription)
                } actions: {
                    emptyDraftActions
                }
                .frame(maxHeight: .infinity)
            }
            .refreshable { await refreshWithCooldown() }
        } else {
            List {
                ForEach(filteredDrafts) { draft in
                    NavigationLink(value: DraftDestination(draft: draft)) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(draft.title)
                                .font(.body)
                                .accessibilityIdentifier("draft-row-\(draft.id)-title")
                            if let body = draft.body, !body.isEmpty {
                                Text(body)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                            if let priority = draft.priority, priority != .normal {
                                Text(priority.rawValue.capitalized)
                                    .font(.caption)
                                    .foregroundStyle(priority == .high ? .red : .secondary)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .accessibilityIdentifier("draft-row-\(draft.id)")
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            deleteDraftTarget = draft.id
                            showDeleteDraftConfirm = true
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }

            }
            .contentMargins(.top, 12, for: .scrollContent)
            .refreshable { await refreshWithCooldown() }
        }
    }

    private var emptyIssueDescription: String {
        if !searchText.isEmpty {
            return "No \(section.rawValue) issues match \"\(searchText)\". Clear search to return to this section."
        }
        if hasActiveFilters {
            return "No \(section.rawValue) issues match the current filters. Clear filters to widen the list."
        }
        switch section {
        case .open:
            return "There are no open issues in the selected repos. Create one or refresh after syncing issuectl web."
        case .running:
            return "No issues have active agent sessions. Launch an agent from any open issue."
        case .unassigned:
            return "Every visible issue has an owner. Create a new issue or adjust filters."
        case .closed:
            return "No closed issues are visible right now. Refresh if you recently closed one."
        case .drafts:
            return emptyDraftDescription
        }
    }

    private var emptyIssueTitle: String {
        if !searchText.isEmpty { return "No Matching Issues" }
        if hasActiveFilters { return "No Filtered Issues" }
        switch section {
        case .drafts: return "No Drafts"
        case .open: return "No Open Issues"
        case .running: return "No Running Issues"
        case .unassigned: return "No Unassigned Issues"
        case .closed: return "No Closed Issues"
        }
    }

    private var emptyIssueIcon: String {
        if !searchText.isEmpty { return "magnifyingglass" }
        if hasActiveFilters { return "line.3.horizontal.decrease.circle" }
        return section.icon
    }

    private var emptyDraftDescription: String {
        if !searchText.isEmpty {
            return "No drafts match \"\(searchText)\"."
        }
        return "Tap + to create a draft."
    }

    private func issueErrorDescription(_ message: String) -> String {
        "\(message)\n\nRetry after starting issuectl web, or open Settings to update the server."
    }

    @ViewBuilder
    private var emptyIssueActions: some View {
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

    @ViewBuilder
    private var emptyDraftActions: some View {
        if !searchText.isEmpty {
            Button("Clear Search", action: hideSearch)
        } else {
            Button("Create Issue") { showCreateSheet = true }
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

    private func prepareLaunch(owner: String, repo: String, number: Int, title: String) async {
        let trace = PerformanceTrace.begin("issues.prepare_launch", metadata: "repo=\(owner)/\(repo) number=\(number)")
        let targetId = "\(owner)/\(repo)#\(number)"
        loadingLaunchTargetId = targetId
        actionError = nil
        defer {
            PerformanceTrace.end(trace, metadata: "target_ready=\(launchTarget != nil) terminal_ready=\(terminalTarget != nil)")
            if loadingLaunchTargetId == targetId {
                loadingLaunchTargetId = nil
            }
        }

        if let deployment = runningDeployment(owner: owner, repo: repo, number: number, deployments: activeDeployments) {
            if deployment.ttydPort != nil {
                terminalTarget = deployment
            } else {
                actionError = "Session is running, but its terminal is not ready yet."
            }
            return
        }

        do {
            let detail = try await api.issueDetail(owner: owner, repo: repo, number: number)
            launchTarget = LaunchTarget(
                owner: owner,
                repo: repo,
                number: number,
                title: title,
                comments: detail.comments,
                referencedFiles: detail.referencedFiles
            )
        } catch {
            actionError = error.localizedDescription
        }
    }

    private func updateIssueState(owner: String, repo: String, number: Int, state: String) async {
        actionError = nil
        do {
            let body = IssueStateRequestBody(state: state, comment: nil)
            let response = try await api.updateIssueState(owner: owner, repo: repo, number: number, body: body)
            if response.success {
                await loadAll(refresh: true)
            } else {
                let verb = state == "closed" ? "close" : "reopen"
                actionError = response.error ?? "Failed to \(verb) issue"
            }
        } catch {
            if isQueueableNetworkFailure(error, isConnected: network.isConnected) {
                offlineSync.enqueueIssueState(
                    owner: owner,
                    repo: repo,
                    issueNumber: number,
                    state: state
                )
                actionError = state == "closed"
                    ? "Issue close queued - will sync when you're back online"
                    : "Issue reopen queued - will sync when you're back online"
            } else {
                actionError = error.localizedDescription
            }
        }
    }

    private func deleteDraft(id: String) async {
        actionError = nil
        do {
            let response = try await api.deleteDraft(id: id)
            if response.success {
                await loadAll(refresh: true)
            } else {
                actionError = response.error ?? "Failed to delete draft"
            }
        } catch {
            actionError = error.localizedDescription
        }
    }

    // MARK: - Loading

    private func loadAll(refresh: Bool = false) async {
        let trace = PerformanceTrace.begin("issues.load_all", metadata: "refresh=\(refresh)")
        isLoading = true
        errorMessage = nil
        actionError = nil
        defer {
            PerformanceTrace.end(trace, metadata: "repos=\(repos.count) issues=\(issuesByRepo.values.reduce(0) { $0 + $1.count }) drafts=\(drafts.count) deployments=\(activeDeployments.count)")
        }
        defer {
            isLoading = false
        }
        do {
            repos = try await api.repos()

            // Supplementary fetches — failures surface via actionError banner
            // but don't block the primary issue list.
            var failures: [String] = []

            async let draftsFetch: Result<DraftsResponse, Error> = {
                do { return .success(try await api.listDrafts()) }
                catch { return .failure(error) }
            }()
            async let deploymentsFetch: Result<ActiveDeploymentsResponse, Error> = {
                do { return .success(try await api.activeDeployments()) }
                catch { return .failure(error) }
            }()
            // Snapshot repos to a local Sendable value so child tasks don't
            // capture main-actor state. Each child returns its result; the
            // sequential `for await` loop collects them without data races.
            let repoSnapshot = repos.map { (fullName: $0.fullName, owner: $0.owner, name: $0.name) }
            async let userFetch: Result<UserResponse, Error> = {
                do { return .success(try await api.currentUser()) }
                catch { return .failure(error) }
            }()

            var repoResults: [RepoIssueLoadResult] = []
            await withTaskGroup(of: RepoIssueLoadResult.self) { group in
                for repo in repoSnapshot {
                    group.addTask { [api] in
                        do {
                            let response = try await api.issues(owner: repo.owner, repo: repo.name, refresh: refresh)
                            return (repo.fullName, repo.name, response.issues, response.cachedAt, response.fromCache, nil)
                        } catch {
                            return (repo.fullName, repo.name, nil, nil, false, error)
                        }
                    }
                }
                for await result in group {
                    repoResults.append(result)
                }
            }

            switch await draftsFetch {
            case .success(let result): drafts = result.drafts
            case .failure(let error): failures.append("drafts (\(error.localizedDescription))")
            }
            switch await deploymentsFetch {
            case .success(let result): activeDeployments = result.deployments
            case .failure(let error): failures.append("sessions (\(error.localizedDescription))")
            }
            switch await userFetch {
            case .success(let user):
                currentUserLogin = user.login
                userFetchFailed = false
            case .failure:
                userFetchFailed = true
                currentUserLogin = nil
            }

            var cachedDates: [Date] = []
            var didUseCachedData = false
            var nextIssuesByRepo: [String: [GitHubIssue]] = [:]
            for (fullName, name, issues, cachedAt, fromCache, error) in repoResults {
                if let issues {
                    nextIssuesByRepo[fullName] = issues
                    didUseCachedData = didUseCachedData || fromCache
                    if let cachedAt, let date = sharedISO8601Formatter.date(from: cachedAt) {
                        cachedDates.append(date)
                    }
                } else if let error {
                    failures.append("\(name) (\(error.localizedDescription))")
                } else {
                    failures.append(name)
                }
            }
            issuesByRepo = nextIssuesByRepo
            issueRepoLookup = makeIssueRepoLookup(itemsByRepo: nextIssuesByRepo)
            oldestCachedAt = cachedDates.min()
            isShowingCachedData = didUseCachedData
            if !failures.isEmpty {
                actionError = "Failed to load: \(failures.joined(separator: ", "))"
            }

            loadPrioritiesInBackground(showFailureBanner: failures.isEmpty)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadPrioritiesInBackground(showFailureBanner: Bool) {
        Task {
            let priorityFailures = await loadPriorities()
            if !priorityFailures.isEmpty && showFailureBanner {
                actionError = "Failed to load: \(priorityFailures.joined(separator: ", "))"
            }
        }
    }

    private func loadPriorities() async -> [String] {
        isLoadingPriorities = true
        // Snapshot repos into a local Sendable value keyed by fullName so
        // child tasks don't capture main-actor state and duplicates are skipped.
        let repoByName: [String: (owner: String, name: String)] = repos.reduce(into: [:]) {
            $0[$1.fullName] = (owner: $1.owner, name: $1.name)
        }
        var priorityResults: [([(String, Priority)], String?)] = []
        await withTaskGroup(of: ([(String, Priority)], String?).self) { group in
            for (_, repo) in repoByName {
                group.addTask { [api] in
                    do {
                        let items = try await api.listPriorities(owner: repo.owner, repo: repo.name)
                        return (items.map { ("\(repo.owner)/\(repo.name)#\($0.issueNumber)", $0.priority) }, nil)
                    } catch {
                        return ([], "\(repo.name) priorities (\(error.localizedDescription))")
                    }
                }
            }
            for await result in group {
                priorityResults.append(result)
            }
        }
        var newPriorities: [String: Priority] = [:]
        var priorityErrors: [String] = []
        for (pairs, errorMsg) in priorityResults {
            for (key, priority) in pairs {
                newPriorities[key] = priority
            }
            if let errorMsg { priorityErrors.append(errorMsg) }
        }
        priorities = newPriorities
        isLoadingPriorities = false
        return priorityErrors
    }

    private func refreshWithCooldown() async {
        guard shouldAllowRefresh(lastRefreshDate: lastRefreshDate, cooldown: refreshCooldown) else {
            return
        }
        lastRefreshDate = Date()
        await loadAll(refresh: true)
    }

    private func makeIssueRepoLookup(itemsByRepo: [String: [GitHubIssue]]) -> [String: (repo: Repo, index: Int)] {
        var lookup: [String: (repo: Repo, index: Int)] = [:]
        for (index, repo) in repos.enumerated() {
            guard let issues = itemsByRepo[repo.fullName] else { continue }
            for issue in issues {
                lookup[issue.htmlUrl] = (repo, index)
            }
        }
        return lookup
    }
}

struct IssueDestination: Hashable {
    let owner: String
    let repo: String
    let number: Int
    let initialIssue: GitHubIssue?

    init(owner: String, repo: String, number: Int, initialIssue: GitHubIssue? = nil) {
        self.owner = owner
        self.repo = repo
        self.number = number
        self.initialIssue = initialIssue
    }

    static func == (lhs: IssueDestination, rhs: IssueDestination) -> Bool {
        lhs.owner == rhs.owner &&
            lhs.repo == rhs.repo &&
            lhs.number == rhs.number
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(owner)
        hasher.combine(repo)
        hasher.combine(number)
    }
}

struct LaunchTarget: Identifiable, Sendable {
    let owner: String
    let repo: String
    let number: Int
    let title: String
    let comments: [GitHubComment]
    let referencedFiles: [String]

    var id: String { "\(owner)/\(repo)#\(number)" }
}

struct DraftDestination: Hashable {
    let draft: Draft

    static func == (lhs: DraftDestination, rhs: DraftDestination) -> Bool {
        lhs.draft.id == rhs.draft.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(draft.id)
    }
}

private struct IssueFilterSummaryItem: Identifiable {
    let title: String
    let value: String
    let systemImage: String

    var id: String { "\(title)-\(value)" }
}

private struct IssueSectionPicker: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @Binding var selected: IssueSection
    let counts: [IssueSection: Int]

    private let columns = [
        GridItem(.flexible(), spacing: 4),
        GridItem(.flexible(), spacing: 4),
        GridItem(.flexible(), spacing: 4),
    ]

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(IssueSection.allCases, id: \.self) { section in
                            sectionButton(section)
                                .frame(minWidth: 132)
                        }
                    }
                }
            } else {
                LazyVGrid(columns: columns, spacing: 4) {
                    ForEach(IssueSection.allCases, id: \.self) { section in
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

    private func sectionButton(_ section: IssueSection) -> some View {
        Button {
            selected = section
        } label: {
            HStack(spacing: 4) {
                Text(section.rawValue.capitalized)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)

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
        .accessibilityLabel("\(section.rawValue.capitalized), \(counts[section] ?? 0) items")
    }
}

private struct IssueFilterSheet: View {
    let repos: [Repo]
    @Binding var selectedRepoIds: Set<Int>
    @Binding var sortOrder: SortOrder
    @Binding var mineOnly: Bool

    let mineFilterEnabled: Bool
    let onParseWithAI: () -> Void

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
                            Label("Priority", systemImage: "arrow.up.arrow.down").tag(SortOrder.priority)
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
                                Text(mineFilterEnabled ? "Show items opened by you." : "Sign in is required for this filter.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .disabled(!mineFilterEnabled)
                        .tint(IssueCTLColors.action)
                    }

                    sheetCard(title: "Actions", systemImage: "wand.and.stars") {
                        Button(action: onParseWithAI) {
                            actionRow(
                                title: "Parse with AI",
                                subtitle: "Create a structured draft from rough notes.",
                                systemImage: "text.viewfinder"
                            )
                        }
                        .buttonStyle(.plain)
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
                Text(hasActiveFilters ? "Active filters applied" : "Showing default issue order")
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

    private func actionRow(title: String, subtitle: String, systemImage: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(IssueCTLColors.action)
                .frame(width: 34, height: 34)
                .background(IssueCTLColors.action.opacity(0.14), in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(.tertiary)
        }
        .padding(10)
        .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private func resetFilters() {
        selectedRepoIds.removeAll()
        sortOrder = .updated
        mineOnly = false
    }
}
