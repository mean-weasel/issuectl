import SwiftUI

struct IssueListView: View {
    @Environment(APIClient.self) private var api
    @State private var repos: [Repo] = []
    @State private var issuesByRepo: [String: [GitHubIssue]] = [:]
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
    private let pageSize = 15
    @State private var displayLimit = 15
    @State private var searchText = ""
    @State private var lastRefreshDate: Date?
    private let refreshCooldown: TimeInterval = 10

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

        switch section {
        case .drafts: return []
        case .open: items = items.filter { issue in
            guard let repo = repoFor(issue: issue) else { return issue.isOpen }
            return issue.isOpen && !isRunning(issue, in: repo.fullName)
        }
        case .running: items = items.filter { issue in
            guard let repo = repoFor(issue: issue) else { return false }
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
        let open = items.filter { issue in
            guard let repo = repoFor(issue: issue) else { return issue.isOpen }
            return issue.isOpen && !isRunning(issue, in: repo.fullName)
        }
        let running = items.filter { issue in
            guard let repo = repoFor(issue: issue) else { return false }
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

    private var filteredDrafts: [Draft] {
        guard !searchText.isEmpty else { return drafts }
        let query = searchText.lowercased()
        return drafts.filter { draft in
            draft.title.lowercased().contains(query) ||
            (draft.body ?? "").lowercased().contains(query)
        }
    }

    private func repoIndex(for issue: GitHubIssue) -> Int? {
        repoIndexForItem(issue, in: issuesByRepo, repos: repos, htmlUrl: { $0.htmlUrl })
    }

    private func repoFor(issue: GitHubIssue) -> Repo? {
        repoForItem(issue, in: issuesByRepo, repos: repos, htmlUrl: { $0.htmlUrl })
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
                    if isLoading && issuesByRepo.isEmpty && drafts.isEmpty {
                        ProgressView("Loading issues...")
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
                    } else if section == .drafts {
                        draftsList
                    } else if filteredIssues.isEmpty {
                        ScrollView {
                            ContentUnavailableView(
                                "No Issues",
                                systemImage: "checkmark.circle",
                                description: Text("No \(section.rawValue) issues.")
                            )
                            .frame(maxHeight: .infinity)
                        }
                        .refreshable { await refreshWithCooldown() }
                    } else {
                        issuesList
                    }
                }
            }
            .navigationTitle("Issues")
            .navigationDestination(for: IssueDestination.self) { dest in
                IssueDetailView(owner: dest.owner, repo: dest.repo, number: dest.number)
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
                    section: $section,
                    sortOrder: $sortOrder,
                    mineOnly: $mineOnly,
                    mineFilterEnabled: currentUserLogin != nil && !userFetchFailed,
                    sectionCounts: sectionCounts,
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
                )
                .presentationDetents([.fraction(0.66), .large])
                .presentationDragIndicator(.visible)
            }
            .fullScreenCover(item: $terminalTarget) { deployment in
                if let port = deployment.ttydPort {
                    TerminalView(
                        deployment: deployment,
                        port: port,
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
            .safeAreaInset(edge: .bottom) {
                issueThumbBar
            }
        }
        .searchable(text: $searchText, prompt: "Search issues")
    }

    private var issueThumbBar: some View {
        ThumbActionBar {
            Button {
                showCreateSheet = true
            } label: {
                Label("Create Issue", systemImage: "plus")
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
            .accessibilityLabel("Issue filters")
        }
        .padding(.bottom, 4)
    }

    // MARK: - Lists

    @ViewBuilder
    private var issuesList: some View {
        let allFiltered = filteredIssues
        let visibleIssues = Array(allFiltered.prefix(displayLimit))
        List {
            if let actionError {
                Label(actionError, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
                    .font(.subheadline)
                    .lineLimit(3)
            }
            ForEach(visibleIssues, id: \.htmlUrl) { issue in
                let color = repoIndex(for: issue).map { RepoColors.color(for: $0) } ?? .secondary
                let repo = repoFor(issue: issue)
                let running = repo.map { isRunning(issue, in: $0.fullName) } ?? false

                if let repo {
                    NavigationLink(value: IssueDestination(
                        owner: repo.owner,
                        repo: repo.name,
                        number: issue.number
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
        .refreshable { await refreshWithCooldown() }
    }

    @ViewBuilder
    private var draftsList: some View {
        if filteredDrafts.isEmpty {
            ScrollView {
                ContentUnavailableView(
                    "No Drafts",
                    systemImage: "doc.text",
                    description: Text("Tap + to create a draft.")
                )
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
                            if let body = draft.body, !body.isEmpty {
                                Text(body)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                            if let priority = draft.priority, priority != .normal {
                                Text(priority.rawValue.capitalized)
                                    .font(.caption2)
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
            .refreshable { await refreshWithCooldown() }
        }
    }

    // MARK: - Actions

    private func prepareLaunch(owner: String, repo: String, number: Int, title: String) async {
        let targetId = "\(owner)/\(repo)#\(number)"
        loadingLaunchTargetId = targetId
        actionError = nil
        defer {
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
            actionError = error.localizedDescription
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
        isLoading = true
        errorMessage = nil
        actionError = nil
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
            switch await draftsFetch {
            case .success(let result): drafts = result.drafts
            case .failure(let error): failures.append("drafts (\(error.localizedDescription))")
            }
            switch await deploymentsFetch {
            case .success(let result): activeDeployments = result.deployments
            case .failure(let error): failures.append("sessions (\(error.localizedDescription))")
            }

            do {
                let user = try await api.currentUser()
                currentUserLogin = user.login
                userFetchFailed = false
            } catch {
                userFetchFailed = true
                failures.append("user profile (\(error.localizedDescription))")
            }

            // Snapshot repos to a local Sendable value so child tasks don't
            // capture main-actor state. Each child returns its result; the
            // sequential `for await` loop collects them without data races.
            let repoSnapshot = repos.map { (fullName: $0.fullName, owner: $0.owner, name: $0.name) }
            var repoResults: [(String, String, [GitHubIssue]?, String?, Error?)] = []
            await withTaskGroup(of: (String, String, [GitHubIssue]?, String?, Error?).self) { group in
                for repo in repoSnapshot {
                    group.addTask { [api] in
                        do {
                            let response = try await api.issues(owner: repo.owner, repo: repo.name, refresh: refresh)
                            return (repo.fullName, repo.name, response.issues, response.cachedAt, nil)
                        } catch {
                            return (repo.fullName, repo.name, nil, nil, error)
                        }
                    }
                }
                for await result in group {
                    repoResults.append(result)
                }
            }
            var cachedDates: [Date] = []
            var nextIssuesByRepo: [String: [GitHubIssue]] = [:]
            for (fullName, name, issues, cachedAt, error) in repoResults {
                if let issues {
                    nextIssuesByRepo[fullName] = issues
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
            oldestCachedAt = cachedDates.min()
            if !failures.isEmpty {
                actionError = "Failed to load: \(failures.joined(separator: ", "))"
            }

            // Fetch priorities for all displayed issues — failures are non-fatal
            let priorityFailures = await loadPriorities()
            if !priorityFailures.isEmpty && failures.isEmpty {
                // Only show priority failures if there aren't already more important errors
                actionError = "Failed to load: \(priorityFailures.joined(separator: ", "))"
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
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
}

struct IssueDestination: Hashable {
    let owner: String
    let repo: String
    let number: Int
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

private struct IssueFilterSheet: View {
    let repos: [Repo]
    @Binding var selectedRepoIds: Set<Int>
    @Binding var section: IssueSection
    @Binding var sortOrder: SortOrder
    @Binding var mineOnly: Bool

    let mineFilterEnabled: Bool
    let sectionCounts: [IssueSection: Int]
    let onParseWithAI: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Filter & Sort")
                            .font(.title2.weight(.bold))
                        Text("\(sectionCounts[section] ?? 0) \(section.rawValue) items")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    sheetCard(title: "Status") {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                            ForEach(IssueSection.allCases, id: \.self) { option in
                                filterOption(
                                    title: option.rawValue.capitalized,
                                    subtitle: "\(sectionCounts[option] ?? 0) items",
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
                            Label("Priority", systemImage: "arrow.up.arrow.down").tag(SortOrder.priority)
                            Label("Updated", systemImage: "clock").tag(SortOrder.updated)
                            Label("Created", systemImage: "calendar").tag(SortOrder.created)
                        }
                        .pickerStyle(.segmented)
                    }

                    VStack(spacing: 0) {
                        Toggle(isOn: $mineOnly) {
                            Label("Mine Only", systemImage: "person.crop.circle")
                                .font(.subheadline.weight(.semibold))
                        }
                        .disabled(!mineFilterEnabled)
                        .padding(12)

                        Divider()

                        Button(action: onParseWithAI) {
                            HStack(spacing: 12) {
                                Image(systemName: "text.viewfinder")
                                    .frame(width: 24)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Parse with AI")
                                        .font(.subheadline.weight(.semibold))
                                    Text("Create a structured draft from rough notes.")
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
